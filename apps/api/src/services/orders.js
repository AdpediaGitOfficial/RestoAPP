import { query, withTransaction } from '../db/index.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { emitStaff, emitTo } from '../realtime/io.js';
import { getSettings } from './settings.js';
import { queuePrintJob, renderKot } from './printing.js';

const SESSION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const sessionCode = () =>
  Array.from({ length: 6 }, () => SESSION_CODE_ALPHABET[Math.floor(Math.random() * SESSION_CODE_ALPHABET.length)]).join('');

/** Statuses a staff member may move an order to, from a given status. */
const ORDER_TRANSITIONS = {
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'READY', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['SERVED'],
  SERVED: [],
  CANCELLED: [],
};

export const ORDER_ACTIVE_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'];

/** Find the live session for a table, or open a new one. */
export async function ensureSession(client, tableId, { guestCount = 1, openedBy = null } = {}) {
  const existing = await client.query(
    `SELECT * FROM table_sessions WHERE table_id = $1 AND status <> 'CLOSED' LIMIT 1`,
    [tableId],
  );
  if (existing.rows[0]) return existing.rows[0];

  // Retry a couple of times in the (unlikely) event of a code collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const { rows } = await client.query(
        `INSERT INTO table_sessions (table_id, code, guest_count, opened_by)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [tableId, sessionCode(), guestCount, openedBy],
      );
      return rows[0];
    } catch (err) {
      if (err.code !== '23505') throw err;
      // unique violation on table_id means a session was opened concurrently
      const retry = await client.query(
        `SELECT * FROM table_sessions WHERE table_id = $1 AND status <> 'CLOSED' LIMIT 1`,
        [tableId],
      );
      if (retry.rows[0]) return retry.rows[0];
    }
  }
  throw conflict('Could not open a session for this table, please try again');
}

/**
 * Price a cart against the *current* menu. The client never gets to
 * decide prices — it only sends item ids and quantities.
 */
async function priceCart(client, cartItems) {
  const itemIds = [...new Set(cartItems.map((i) => i.menuItemId))];
  const { rows: menuRows } = await client.query(
    `SELECT id, name, price, is_available, is_active, kitchen_station FROM menu_items WHERE id = ANY($1::uuid[])`,
    [itemIds],
  );
  const menu = new Map(menuRows.map((r) => [r.id, r]));

  const { rows: variantRows } = await client.query(
    `SELECT id, menu_item_id, name, price_delta FROM menu_item_variants WHERE menu_item_id = ANY($1::uuid[])`,
    [itemIds],
  );
  const variants = new Map(variantRows.map((r) => [r.id, r]));

  const { rows: addonRows } = await client.query(
    `SELECT id, menu_item_id, name, price, is_active FROM menu_item_addons WHERE menu_item_id = ANY($1::uuid[])`,
    [itemIds],
  );
  const addons = new Map(addonRows.map((r) => [r.id, r]));

  const priced = [];
  for (const cartItem of cartItems) {
    const item = menu.get(cartItem.menuItemId);
    if (!item) throw badRequest('One of the items is no longer on the menu');
    if (!item.is_active || !item.is_available) throw conflict(`"${item.name}" has just run out — please remove it from your order`);

    let unitPrice = item.price;
    let variantName = null;
    if (cartItem.variantId) {
      const variant = variants.get(cartItem.variantId);
      if (!variant || variant.menu_item_id !== item.id) throw badRequest(`Invalid option chosen for "${item.name}"`);
      unitPrice += variant.price_delta;
      variantName = variant.name;
    }

    const chosenAddons = [];
    let addonsTotal = 0;
    for (const addonId of cartItem.addonIds || []) {
      const addon = addons.get(addonId);
      if (!addon || addon.menu_item_id !== item.id || !addon.is_active) {
        throw badRequest(`Invalid add-on chosen for "${item.name}"`);
      }
      chosenAddons.push({ id: addon.id, name: addon.name, price: addon.price });
      addonsTotal += addon.price;
    }

    priced.push({
      menu_item_id: item.id,
      variant_id: cartItem.variantId || null,
      item_name: item.name,
      variant_name: variantName,
      unit_price: unitPrice,
      quantity: cartItem.quantity,
      addons: chosenAddons,
      addons_total: addonsTotal,
      line_total: (unitPrice + addonsTotal) * cartItem.quantity,
      note: (cartItem.note || '').slice(0, 200),
      kitchen_station: item.kitchen_station,
    });
  }
  return priced;
}

/**
 * Create an order for a table. Used by both the guest QR flow and by staff.
 * Everything happens in one transaction: session, order, lines, notification.
 */
export async function createOrder({ tableId, items, note = '', channel = 'QR', placedBy = null, guestDevice = null, guestCount }) {
  if (!items?.length) throw badRequest('Your order is empty');

  const settings = await getSettings();
  if (!settings.accept_orders && channel === 'QR') {
    throw conflict('The kitchen is not accepting orders right now');
  }

  const result = await withTransaction(async (client) => {
    const { rows: tableRows } = await client.query(
      'SELECT * FROM dining_tables WHERE id = $1 FOR UPDATE',
      [tableId],
    );
    const table = tableRows[0];
    if (!table) throw notFound('Table not found');
    if (!table.is_active) throw conflict('This table is not in service');

    const session = await ensureSession(client, table.id, { guestCount, openedBy: placedBy });
    if (session.status === 'BILLED') {
      throw conflict('This table has already been billed. Please ask a supervisor to start a new session.');
    }
    // A guest asking for the bill then ordering again reopens the session.
    if (session.status === 'BILL_REQUESTED') {
      await client.query(
        `UPDATE table_sessions SET status = 'OPEN', bill_requested_at = NULL WHERE id = $1`,
        [session.id],
      );
      session.status = 'OPEN';
    }

    const priced = await priceCart(client, items);
    const subtotal = priced.reduce((sum, i) => sum + i.line_total, 0);

    const { rows: orderRows } = await client.query(
      `INSERT INTO orders (session_id, table_id, channel, note, subtotal, placed_by, guest_device)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [session.id, table.id, channel, note.slice(0, 500), subtotal, placedBy, guestDevice],
    );
    const order = orderRows[0];

    const inserted = [];
    for (const item of priced) {
      const { rows } = await client.query(
        `INSERT INTO order_items
           (order_id, menu_item_id, variant_id, item_name, variant_name, unit_price,
            quantity, addons, addons_total, line_total, note, kitchen_station)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12) RETURNING *`,
        [order.id, item.menu_item_id, item.variant_id, item.item_name, item.variant_name,
          item.unit_price, item.quantity, JSON.stringify(item.addons), item.addons_total,
          item.line_total, item.note, item.kitchen_station],
      );
      inserted.push(rows[0]);
    }

    await client.query(
      `INSERT INTO notifications (type, table_id, session_id, order_id, message)
       VALUES ('NEW_ORDER', $1, $2, $3, $4)`,
      [table.id, session.id, order.id, `New order #${order.order_number} from ${table.label}`],
    );

    return { order, items: inserted, table, session, settings };
  });

  // Side effects outside the transaction: print + notify.
  const stations = [...new Set(result.items.map((i) => i.kitchen_station))];
  for (const station of stations) {
    const stationItems = result.items.filter((i) => i.kitchen_station === station);
    await queuePrintJob({
      type: 'KOT',
      station,
      orderId: result.order.id,
      content: renderKot({ ...result, items: stationItems }),
    });
  }

  const payload = await getOrder(result.order.id);
  emitStaff('order:created', payload);
  emitTo(`session:${result.session.id}`, 'order:created', payload);
  emitTo(`table:${result.table.id}`, 'order:created', payload);
  return payload;
}

const ORDER_SELECT = `
  SELECT o.*,
         t.label AS table_label, t.code AS table_code,
         s.code  AS session_code, s.status AS session_status,
         u.name  AS placed_by_name,
         COALESCE(
           json_agg(
             json_build_object(
               'id', oi.id, 'menu_item_id', oi.menu_item_id, 'item_name', oi.item_name,
               'variant_name', oi.variant_name, 'unit_price', oi.unit_price, 'quantity', oi.quantity,
               'addons', oi.addons, 'addons_total', oi.addons_total, 'line_total', oi.line_total,
               'note', oi.note, 'status', oi.status, 'kitchen_station', oi.kitchen_station
             ) ORDER BY oi.created_at
           ) FILTER (WHERE oi.id IS NOT NULL), '[]'
         ) AS items
  FROM orders o
  JOIN dining_tables t  ON t.id = o.table_id
  JOIN table_sessions s ON s.id = o.session_id
  LEFT JOIN users u     ON u.id = o.placed_by
  LEFT JOIN order_items oi ON oi.order_id = o.id
`;
const ORDER_GROUP = ' GROUP BY o.id, t.label, t.code, s.code, s.status, u.name';

export async function getOrder(id) {
  const { rows } = await query(`${ORDER_SELECT} WHERE o.id = $1 ${ORDER_GROUP}`, [id]);
  if (!rows[0]) throw notFound('Order not found');
  return rows[0];
}

export async function listOrders({ status, sessionId, tableId, active, from, to, limit = 100 } = {}) {
  const where = [];
  const params = [];
  const add = (clause, value) => { params.push(value); where.push(clause.replace('?', `$${params.length}`)); };

  if (status) add('o.status = ?::order_status', status);
  if (active) where.push(`o.status = ANY('{PLACED,ACCEPTED,PREPARING,READY}'::order_status[])`);
  if (sessionId) add('o.session_id = ?', sessionId);
  if (tableId) add('o.table_id = ?', tableId);
  if (from) add('o.created_at >= ?', from);
  if (to) add('o.created_at < ?', to);

  params.push(Math.min(Number(limit) || 100, 500));
  const { rows } = await query(
    `${ORDER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ${ORDER_GROUP}
     ORDER BY o.created_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}

const STATUS_TIMESTAMP = {
  ACCEPTED: 'accepted_at',
  READY: 'ready_at',
  SERVED: 'served_at',
  CANCELLED: 'cancelled_at',
};

export async function updateOrderStatus(orderId, nextStatus, { userId, reason } = {}) {
  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    const order = rows[0];
    if (!order) throw notFound('Order not found');
    if (order.status === nextStatus) return order;

    const allowed = ORDER_TRANSITIONS[order.status] || [];
    if (!allowed.includes(nextStatus)) {
      throw conflict(`An order that is ${order.status.toLowerCase()} cannot be marked ${nextStatus.toLowerCase()}`);
    }
    if (nextStatus === 'CANCELLED') {
      const billed = await client.query(
        `SELECT 1 FROM bills WHERE session_id = $1 AND status = 'SETTLED'`,
        [order.session_id],
      );
      if (billed.rowCount) throw conflict('This table is already billed — the order cannot be cancelled');
    }

    const tsColumn = STATUS_TIMESTAMP[nextStatus];
    const { rows: out } = await client.query(
      `UPDATE orders SET status = $2 ${tsColumn ? `, ${tsColumn} = now()` : ''}
         ${nextStatus === 'CANCELLED' ? ', cancel_reason = $3' : ''}
       WHERE id = $1 RETURNING *`,
      nextStatus === 'CANCELLED' ? [orderId, nextStatus, reason || null] : [orderId, nextStatus],
    );

    // Keep the individual lines in step with the order as a whole.
    const itemStatus = { ACCEPTED: 'PENDING', PREPARING: 'PREPARING', READY: 'READY', SERVED: 'SERVED', CANCELLED: 'CANCELLED' }[nextStatus];
    if (itemStatus && nextStatus !== 'ACCEPTED') {
      await client.query(
        `UPDATE order_items SET status = $2::order_item_status WHERE order_id = $1 AND status <> 'CANCELLED'`,
        [orderId, itemStatus],
      );
    }

    if (nextStatus === 'CANCELLED') {
      await client.query(
        `INSERT INTO notifications (type, table_id, session_id, order_id, message)
         VALUES ('ORDER_CANCELLED', $1, $2, $3, $4)`,
        [order.table_id, order.session_id, order.id, `Order #${order.order_number} was cancelled`],
      );
    }
    return out[0];
  });

  const payload = await getOrder(orderId);
  emitStaff('order:updated', payload);
  emitTo(`session:${payload.session_id}`, 'order:updated', payload);
  emitTo(`table:${payload.table_id}`, 'order:updated', payload);

  if (nextStatus === 'CANCELLED') {
    const settings = await getSettings();
    await queuePrintJob({
      type: 'KOT_VOID',
      station: payload.items?.[0]?.kitchen_station || 'KITCHEN',
      orderId,
      content: renderKot({
        order: payload, items: payload.items, table: { label: payload.table_label },
        session: { code: payload.session_code }, settings, isVoid: true,
      }),
    });
  }
  return payload;
}

export async function updateOrderItemStatus(itemId, status) {
  const { rows } = await query(
    `UPDATE order_items SET status = $2::order_item_status WHERE id = $1 RETURNING order_id`,
    [itemId, status],
  );
  if (!rows[0]) throw notFound('Order line not found');
  const payload = await getOrder(rows[0].order_id);
  emitStaff('order:updated', payload);
  emitTo(`session:${payload.session_id}`, 'order:updated', payload);
  return payload;
}
