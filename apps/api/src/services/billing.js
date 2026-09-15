import { query, withTransaction } from '../db/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { percentOf, roundTotal } from '../lib/money.js';
import { emitStaff, emitTo } from '../realtime/io.js';
import { queuePrintJob, renderBill } from './printing.js';
import { getSettings } from './settings.js';

/**
 * The single place bill arithmetic lives. Given a subtotal (sum of
 * non-cancelled order lines) and the restaurant settings, work out
 * every line of the bill. Pure function — easy to test, easy to trust.
 */
export function computeTotals(subtotal, settings, { discountAmount = 0 } = {}) {
  const discount = Math.min(Math.max(0, Math.round(discountAmount)), subtotal);
  const taxable = subtotal - discount;

  const serviceCharge = percentOf(taxable, settings.service_charge_percent);
  let tax;
  if (settings.tax_inclusive) {
    // Prices already contain the tax: extract it for the printed breakdown.
    const rate = Number(settings.tax_percent) / 100;
    tax = Math.round((taxable + serviceCharge) - (taxable + serviceCharge) / (1 + rate));
  } else {
    tax = percentOf(taxable + serviceCharge, settings.tax_percent);
  }

  let total = settings.tax_inclusive ? taxable + serviceCharge : taxable + serviceCharge + tax;
  let rounding = 0;
  if (settings.round_bill_total) [total, rounding] = roundTotal(total);

  return {
    subtotal,
    discount_amount: discount,
    service_charge_percent: Number(settings.service_charge_percent),
    service_charge_amount: serviceCharge,
    tax_percent: Number(settings.tax_percent),
    tax_amount: tax,
    tax_inclusive: settings.tax_inclusive,
    rounding_adjustment: rounding,
    total,
  };
}

async function sessionSubtotal(client, sessionId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(subtotal), 0)::int AS subtotal
       FROM orders WHERE session_id = $1 AND status <> 'CANCELLED'`,
    [sessionId],
  );
  return rows[0].subtotal;
}

async function nextBillNumber(client) {
  const { rows } = await client.query(`SELECT nextval('bill_number_seq') AS n`);
  const date = new Date();
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  return `B${ymd}-${String(rows[0].n).padStart(4, '0')}`;
}

/**
 * Create (or refresh) the draft bill for a session. Supervisors call this
 * when a table asks to pay; running it again re-prices the draft, so a late
 * order or a changed discount is always picked up.
 */
export async function generateBill(sessionId, { userId, discountAmount = 0, discountReason = '' } = {}) {
  const settings = await getSettings();

  const bill = await withTransaction(async (client) => {
    const { rows: sessionRows } = await client.query(
      'SELECT * FROM table_sessions WHERE id = $1 FOR UPDATE',
      [sessionId],
    );
    const session = sessionRows[0];
    if (!session) throw notFound('Session not found');
    if (session.status === 'CLOSED') throw conflict('This session is closed');

    const { rows: existing } = await client.query(
      `SELECT * FROM bills WHERE session_id = $1 AND status <> 'VOID' FOR UPDATE`,
      [sessionId],
    );
    if (existing[0]?.status === 'SETTLED') throw conflict('This bill is already settled');

    const pending = await client.query(
      `SELECT COUNT(*)::int AS n FROM orders
        WHERE session_id = $1 AND status = ANY('{PLACED,ACCEPTED,PREPARING}'::order_status[])`,
      [sessionId],
    );

    const subtotal = await sessionSubtotal(client, sessionId);
    if (subtotal <= 0) throw badRequest('There is nothing to bill for this table yet');

    const totals = computeTotals(subtotal, settings, { discountAmount });

    const values = [
      sessionId, session.table_id, totals.subtotal, totals.discount_amount, discountReason,
      totals.tax_percent, totals.tax_amount, totals.service_charge_percent,
      totals.service_charge_amount, totals.rounding_adjustment, totals.total, userId,
    ];

    const { rows } = existing[0]
      ? await client.query(
        `UPDATE bills SET subtotal=$3, discount_amount=$4, discount_reason=$5, tax_percent=$6,
                tax_amount=$7, service_charge_percent=$8, service_charge_amount=$9,
                rounding_adjustment=$10, total=$11, created_by=COALESCE(created_by,$12)
           WHERE id = $13 RETURNING *`,
        [...values, existing[0].id],
      )
      : await client.query(
        `INSERT INTO bills (session_id, table_id, subtotal, discount_amount, discount_reason,
             tax_percent, tax_amount, service_charge_percent, service_charge_amount,
             rounding_adjustment, total, created_by, bill_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [...values, await nextBillNumber(client)],
      );

    return { ...rows[0], pending_orders: pending.rows[0].n };
  });

  emitStaff('bill:generated', bill);
  emitTo(`session:${sessionId}`, 'bill:generated', bill);
  return bill;
}

/** Take payment, close the session, print the receipt. */
export async function settleBill(billId, { userId, paymentMethod, paymentReference = null, amountPaid }) {
  const settings = await getSettings();

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM bills WHERE id = $1 FOR UPDATE', [billId]);
    const bill = rows[0];
    if (!bill) throw notFound('Bill not found');
    if (bill.status === 'SETTLED') throw conflict('This bill is already settled');
    if (bill.status === 'VOID') throw conflict('This bill was voided');

    const paid = amountPaid ?? bill.total;
    if (paid < bill.total) {
      throw badRequest('The amount collected is less than the bill total');
    }

    const { rows: settled } = await client.query(
      `UPDATE bills SET status = 'SETTLED', payment_method = $2::payment_method,
              payment_reference = $3, amount_paid = $4, settled_by = $5, settled_at = now()
        WHERE id = $1 RETURNING *`,
      [billId, paymentMethod, paymentReference, paid, userId],
    );

    await client.query(
      `UPDATE table_sessions SET status = 'CLOSED', closed_at = now(), closed_by = $2 WHERE id = $1`,
      [bill.session_id, userId],
    );
    // Anything still open on a paid table counts as served.
    await client.query(
      `UPDATE orders SET status = 'SERVED', served_at = COALESCE(served_at, now())
        WHERE session_id = $1 AND status = ANY('{PLACED,ACCEPTED,PREPARING,READY}'::order_status[])`,
      [bill.session_id],
    );

    const { rows: items } = await client.query(
      `SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE o.session_id = $1 AND o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
        ORDER BY oi.created_at`,
      [bill.session_id],
    );
    const { rows: ctx } = await client.query(
      `SELECT s.*, t.label, t.code AS table_code FROM table_sessions s
         JOIN dining_tables t ON t.id = s.table_id WHERE s.id = $1`,
      [bill.session_id],
    );

    return { bill: settled[0], items, session: ctx[0], table: { label: ctx[0].label } };
  });

  await queuePrintJob({
    type: 'BILL',
    station: 'COUNTER',
    billId,
    content: renderBill({
      bill: result.bill, items: result.items, table: result.table,
      session: result.session, settings,
      payment: { method: paymentMethod, reference: paymentReference },
    }),
  });

  emitStaff('bill:settled', result.bill);
  emitTo(`session:${result.bill.session_id}`, 'bill:settled', result.bill);
  return result.bill;
}

export async function voidBill(billId, { userId, reason }) {
  const { rows } = await query(
    `UPDATE bills SET status = 'VOID', voided_by = $2, voided_at = now(), void_reason = $3
      WHERE id = $1 AND status <> 'SETTLED' RETURNING *`,
    [billId, userId, reason || null],
  );
  if (!rows[0]) throw conflict('Only an unsettled bill can be voided');
  await query(`UPDATE table_sessions SET status = 'OPEN' WHERE id = $1 AND status <> 'CLOSED'`, [rows[0].session_id]);
  emitStaff('bill:voided', rows[0]);
  return rows[0];
}

export async function getBill(billId) {
  const { rows } = await query(
    `SELECT b.*, t.label AS table_label, s.code AS session_code, s.guest_count,
            cu.name AS created_by_name, su.name AS settled_by_name
       FROM bills b
       JOIN dining_tables t ON t.id = b.table_id
       JOIN table_sessions s ON s.id = b.session_id
       LEFT JOIN users cu ON cu.id = b.created_by
       LEFT JOIN users su ON su.id = b.settled_by
      WHERE b.id = $1`,
    [billId],
  );
  const bill = rows[0];
  if (!bill) throw notFound('Bill not found');

  const { rows: items } = await query(
    `SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE o.session_id = $1 AND o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
      ORDER BY oi.created_at`,
    [bill.session_id],
  );
  return { bill, items, settings: await getSettings() };
}

export async function listBills({ from, to, status, limit = 100 } = {}) {
  const where = [];
  const params = [];
  const add = (clause, value) => { params.push(value); where.push(clause.replace('?', `$${params.length}`)); };
  if (status) add('b.status = ?::bill_status', status);
  if (from) add('b.created_at >= ?', from);
  if (to) add('b.created_at < ?', to);
  params.push(Math.min(Number(limit) || 100, 500));

  const { rows } = await query(
    `SELECT b.*, t.label AS table_label, s.code AS session_code, u.name AS settled_by_name
       FROM bills b
       JOIN dining_tables t ON t.id = b.table_id
       JOIN table_sessions s ON s.id = b.session_id
       LEFT JOIN users u ON u.id = b.settled_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY b.created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}
