/**
 * Guest-facing endpoints. No login: the QR token identifies the table and
 * the session id (handed back on first load) identifies the seating.
 * Nothing here can read another table's data or set its own prices.
 */
import { Router } from 'express';
import { query } from '../db/index.js';
import { asyncHandler, forbidden, notFound } from '../lib/errors.js';
import { validate, z } from '../lib/validate.js';
import { createOrder } from '../services/orders.js';
import { callWaiter, getSessionDetail, requestBill, updateSession } from '../services/sessions.js';
import { getSettings } from '../services/settings.js';
import { computeTotals } from '../services/billing.js';

export const publicRoutes = Router();

async function tableByToken(token) {
  const { rows } = await query('SELECT * FROM dining_tables WHERE qr_token = $1 AND is_active = true', [token]);
  if (!rows[0]) throw notFound('This QR code is not linked to a table. Please ask our staff for help.');
  return rows[0];
}

/** Everything the guest app needs on first scan. */
publicRoutes.get('/tables/:token', asyncHandler(async (req, res) => {
  const table = await tableByToken(req.params.token);
  const settings = await getSettings();
  const { rows } = await query(
    `SELECT id, code, status, guest_count, opened_at FROM table_sessions
      WHERE table_id = $1 AND status <> 'CLOSED' LIMIT 1`,
    [table.id],
  );
  res.json({
    table: { id: table.id, code: table.code, label: table.label, seats: table.seats, zone: table.zone },
    session: rows[0] || null,
    restaurant: {
      name: settings.name,
      currency_symbol: settings.currency_symbol,
      tax_label: settings.tax_label,
      tax_percent: Number(settings.tax_percent),
      service_charge_percent: Number(settings.service_charge_percent),
      tax_inclusive: settings.tax_inclusive,
      accept_orders: settings.accept_orders,
    },
  });
}));

/** The live menu, grouped by category. Unavailable items are flagged, not hidden. */
publicRoutes.get('/menu', asyncHandler(async (_req, res) => {
  const { rows } = await query(`
    SELECT c.id, c.name, c.description, c.sort_order,
      COALESCE(json_agg(
        json_build_object(
          'id', m.id, 'name', m.name, 'description', m.description, 'price', m.price,
          'image_url', m.image_url, 'food_type', m.food_type, 'is_available', m.is_available,
          'is_recommended', m.is_recommended, 'spice_level', m.spice_level,
          'prep_minutes', m.prep_minutes, 'tags', m.tags,
          'variants', COALESCE(v.variants, '[]'::json),
          'addons',   COALESCE(a.addons,   '[]'::json)
        ) ORDER BY m.sort_order, m.name
      ) FILTER (WHERE m.id IS NOT NULL), '[]') AS items
    FROM categories c
    LEFT JOIN menu_items m ON m.category_id = c.id AND m.is_active = true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', mv.id, 'name', mv.name, 'price_delta', mv.price_delta,
                                        'is_default', mv.is_default) ORDER BY mv.sort_order) AS variants
      FROM menu_item_variants mv WHERE mv.menu_item_id = m.id
    ) v ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', ma.id, 'name', ma.name, 'price', ma.price)
                      ORDER BY ma.sort_order) AS addons
      FROM menu_item_addons ma WHERE ma.menu_item_id = m.id AND ma.is_active = true
    ) a ON true
    WHERE c.is_active = true
    GROUP BY c.id
    ORDER BY c.sort_order, c.name`);
  res.json({ categories: rows });
}));

const cartSchema = z.object({
  token: z.string().min(1),
  guestDevice: z.string().max(100).optional(),
  guestCount: z.number().int().min(1).max(50).optional(),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    menuItemId: z.string().uuid(),
    variantId: z.string().uuid().nullable().optional(),
    addonIds: z.array(z.string().uuid()).max(20).optional(),
    quantity: z.number().int().min(1).max(50),
    note: z.string().max(200).optional(),
  })).min(1, 'Add at least one item to your order').max(50),
});

publicRoutes.post('/orders', validate(cartSchema), asyncHandler(async (req, res) => {
  const table = await tableByToken(req.body.token);
  const order = await createOrder({
    tableId: table.id,
    items: req.body.items,
    note: req.body.note || '',
    channel: 'QR',
    guestDevice: req.body.guestDevice || null,
    guestCount: req.body.guestCount,
  });
  res.status(201).json({ order });
}));

/** Guard: a session can only be read through the QR token of its own table. */
async function assertSessionBelongsToToken(sessionId, token) {
  const { rows } = await query(
    `SELECT s.id FROM table_sessions s
       JOIN dining_tables t ON t.id = s.table_id
      WHERE s.id = $1 AND t.qr_token = $2`,
    [sessionId, token],
  );
  if (!rows[0]) throw forbidden('This order belongs to a different table');
}

/** Live view of the guest's own tab: orders, statuses and the running total. */
publicRoutes.get('/sessions/:id', asyncHandler(async (req, res) => {
  const token = req.query.token;
  if (!token) throw forbidden('Missing table token');
  await assertSessionBelongsToToken(req.params.id, token);

  const detail = await getSessionDetail(req.params.id);
  const settings = detail.settings;
  res.json({
    session: {
      id: detail.session.id, code: detail.session.code, status: detail.session.status,
      guest_count: detail.session.guest_count, opened_at: detail.session.opened_at,
      table_label: detail.session.table_label,
    },
    orders: detail.orders.map((o) => ({
      id: o.id, order_number: o.order_number, status: o.status, note: o.note,
      subtotal: o.subtotal, created_at: o.created_at, items: o.items,
    })),
    subtotal: detail.subtotal,
    totals: computeTotals(detail.subtotal, settings),
    bill: detail.bill ? {
      id: detail.bill.id, bill_number: detail.bill.bill_number, status: detail.bill.status,
      total: detail.bill.total, subtotal: detail.bill.subtotal, tax_amount: detail.bill.tax_amount,
      discount_amount: detail.bill.discount_amount,
      service_charge_amount: detail.bill.service_charge_amount,
      rounding_adjustment: detail.bill.rounding_adjustment,
    } : null,
    currency_symbol: settings.currency_symbol,
  });
}));

publicRoutes.post('/sessions/:id/request-bill',
  validate(z.object({
    token: z.string().min(1),
    paymentPreference: z.enum(['CASH', 'CARD', 'UPI', 'WALLET', 'OTHER']).optional(),
  })),
  asyncHandler(async (req, res) => {
    await assertSessionBelongsToToken(req.params.id, req.body.token);
    const session = await requestBill(req.params.id, { paymentPreference: req.body.paymentPreference || null });
    res.json({ session: { id: session.id, status: session.status, bill_requested_at: session.bill_requested_at } });
  }));

publicRoutes.post('/sessions/:id/call-waiter',
  validate(z.object({ token: z.string().min(1), message: z.string().max(200).optional() })),
  asyncHandler(async (req, res) => {
    await assertSessionBelongsToToken(req.params.id, req.body.token);
    res.json(await callWaiter(req.params.id, req.body.message || ''));
  }));

publicRoutes.patch('/sessions/:id',
  validate(z.object({
    token: z.string().min(1),
    guestCount: z.number().int().min(1).max(50).optional(),
    guestName: z.string().max(80).optional(),
    guestPhone: z.string().max(20).optional(),
  })),
  asyncHandler(async (req, res) => {
    await assertSessionBelongsToToken(req.params.id, req.body.token);
    const session = await updateSession(req.params.id, req.body);
    res.json({ session: { id: session.id, guest_count: session.guest_count } });
  }));
