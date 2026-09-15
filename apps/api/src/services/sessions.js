import { query, withTransaction } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { emitStaff, emitTo } from '../realtime/io.js';
import { computeTotals } from './billing.js';
import { getSettings } from './settings.js';

/**
 * One row per table with its live session, running total and pending counts.
 * This is what the supervisor floor view is built from.
 */
export async function listTableBoard() {
  const settings = await getSettings();
  const { rows } = await query(`
    SELECT
      t.id, t.code, t.label, t.seats, t.zone, t.qr_token, t.is_active, t.sort_order,
      s.id AS session_id, s.code AS session_code, s.status AS session_status,
      s.opened_at, s.guest_count, s.bill_requested_at, s.payment_preference,
      COALESCE(agg.order_count, 0)        AS order_count,
      COALESCE(agg.running_subtotal, 0)   AS running_subtotal,
      COALESCE(agg.pending_orders, 0)     AS pending_orders,
      agg.last_order_at,
      b.id AS bill_id, b.bill_number, b.status AS bill_status, b.total AS bill_total
    FROM dining_tables t
    LEFT JOIN table_sessions s
      ON s.table_id = t.id AND s.status <> 'CLOSED'
    LEFT JOIN LATERAL (
      SELECT COUNT(*)                                       AS order_count,
             SUM(o.subtotal) FILTER (WHERE o.status <> 'CANCELLED') AS running_subtotal,
             COUNT(*) FILTER (WHERE o.status = ANY('{PLACED,ACCEPTED,PREPARING,READY}'::order_status[])) AS pending_orders,
             MAX(o.created_at)                              AS last_order_at
      FROM orders o WHERE o.session_id = s.id
    ) agg ON true
    LEFT JOIN bills b ON b.session_id = s.id AND b.status <> 'VOID'
    ORDER BY t.sort_order, t.code
  `);

  return rows.map((row) => ({
    ...row,
    running_subtotal: Number(row.running_subtotal) || 0,
    totals: row.session_id ? computeTotals(Number(row.running_subtotal) || 0, settings) : null,
  }));
}

/** Full detail for one session: orders, lines, running totals, bill. */
export async function getSessionDetail(sessionId) {
  const { rows } = await query(
    `SELECT s.*, t.label AS table_label, t.code AS table_code, t.seats
       FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id
      WHERE s.id = $1`,
    [sessionId],
  );
  const session = rows[0];
  if (!session) throw notFound('Session not found');

  const { rows: orders } = await query(`
    SELECT o.*, u.name AS placed_by_name,
      COALESCE(json_agg(
        json_build_object(
          'id', oi.id, 'item_name', oi.item_name, 'variant_name', oi.variant_name,
          'unit_price', oi.unit_price, 'quantity', oi.quantity, 'addons', oi.addons,
          'addons_total', oi.addons_total, 'line_total', oi.line_total, 'note', oi.note,
          'status', oi.status, 'kitchen_station', oi.kitchen_station
        ) ORDER BY oi.created_at
      ) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN users u ON u.id = o.placed_by
    WHERE o.session_id = $1
    GROUP BY o.id, u.name
    ORDER BY o.created_at`, [sessionId]);

  const { rows: billRows } = await query(
    `SELECT * FROM bills WHERE session_id = $1 AND status <> 'VOID' LIMIT 1`,
    [sessionId],
  );

  const settings = await getSettings();
  const subtotal = orders
    .filter((o) => o.status !== 'CANCELLED')
    .reduce((sum, o) => sum + o.subtotal, 0);

  return {
    session,
    orders,
    bill: billRows[0] || null,
    subtotal,
    totals: computeTotals(subtotal, settings),
    settings,
  };
}

/** Guest taps "Request bill" in the app. */
export async function requestBill(sessionId, { paymentPreference = null } = {}) {
  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM table_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
    const session = rows[0];
    if (!session) throw notFound('Session not found');
    if (session.status === 'CLOSED') throw conflict('This session is already closed');
    if (session.status === 'BILLED') throw conflict('The bill has already been settled');

    const { rows: out } = await client.query(
      `UPDATE table_sessions
          SET status = 'BILL_REQUESTED',
              bill_requested_at = COALESCE(bill_requested_at, now()),
              payment_preference = COALESCE($2, payment_preference)
        WHERE id = $1 RETURNING *`,
      [sessionId, paymentPreference],
    );

    const { rows: tableRows } = await client.query('SELECT * FROM dining_tables WHERE id = $1', [session.table_id]);
    await client.query(
      `INSERT INTO notifications (type, table_id, session_id, message)
       VALUES ('BILL_REQUEST', $1, $2, $3)`,
      [session.table_id, sessionId,
        `${tableRows[0].label} requested the bill${paymentPreference ? ` (${paymentPreference})` : ''}`],
    );
    return { session: out[0], table: tableRows[0] };
  });

  const payload = {
    sessionId,
    tableId: updated.session.table_id,
    tableLabel: updated.table.label,
    paymentPreference,
    requestedAt: updated.session.bill_requested_at,
  };
  emitStaff('bill:requested', payload);
  emitTo(`session:${sessionId}`, 'session:updated', updated.session);
  return updated.session;
}

/** Guest taps "Call waiter". */
export async function callWaiter(sessionId, message = '') {
  const { rows } = await query(
    `SELECT s.*, t.label FROM table_sessions s JOIN dining_tables t ON t.id = s.table_id WHERE s.id = $1`,
    [sessionId],
  );
  const session = rows[0];
  if (!session) throw notFound('Session not found');

  await query(
    `INSERT INTO notifications (type, table_id, session_id, message)
     VALUES ('WAITER_CALL', $1, $2, $3)`,
    [session.table_id, sessionId, `${session.label} needs assistance${message ? `: ${message}` : ''}`],
  );
  emitStaff('waiter:called', { sessionId, tableId: session.table_id, tableLabel: session.label, message });
  return { ok: true };
}

export async function updateSession(sessionId, { guestCount, guestName, guestPhone }) {
  const { rows } = await query(
    `UPDATE table_sessions
        SET guest_count = COALESCE($2, guest_count),
            guest_name  = COALESCE($3, guest_name),
            guest_phone = COALESCE($4, guest_phone)
      WHERE id = $1 RETURNING *`,
    [sessionId, guestCount ?? null, guestName ?? null, guestPhone ?? null],
  );
  if (!rows[0]) throw notFound('Session not found');
  emitTo(`session:${sessionId}`, 'session:updated', rows[0]);
  emitStaff('session:updated', rows[0]);
  return rows[0];
}

/** Close a session without billing it (walk-out, test order, merged table). */
export async function closeSession(sessionId, userId) {
  const { rows } = await query(
    `UPDATE table_sessions SET status = 'CLOSED', closed_at = now(), closed_by = $2
      WHERE id = $1 AND status <> 'CLOSED' RETURNING *`,
    [sessionId, userId],
  );
  if (!rows[0]) throw conflict('This session is already closed');
  emitStaff('session:closed', rows[0]);
  emitTo(`session:${sessionId}`, 'session:closed', rows[0]);
  return rows[0];
}

export async function listNotifications({ unreadOnly = true, limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT n.*, t.label AS table_label, s.code AS session_code
       FROM notifications n
       LEFT JOIN dining_tables t ON t.id = n.table_id
       LEFT JOIN table_sessions s ON s.id = n.session_id
      ${unreadOnly ? 'WHERE n.is_read = false' : ''}
      ORDER BY n.created_at DESC LIMIT $1`,
    [Math.min(Number(limit) || 50, 200)],
  );
  return rows;
}

export async function markNotificationRead(id, userId) {
  const { rows } = await query(
    `UPDATE notifications SET is_read = true, read_by = $2, read_at = now() WHERE id = $1 RETURNING *`,
    [id, userId],
  );
  if (!rows[0]) throw notFound('Notification not found');
  emitStaff('notification:read', rows[0]);
  return rows[0];
}
