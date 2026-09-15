/** Restaurant admin: menu, tables & QR codes, settings. */
import { Router } from 'express';
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { query, withTransaction } from '../db/index.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { asyncHandler, conflict, notFound } from '../lib/errors.js';
import { validate, z } from '../lib/validate.js';
import { dailyMetrics, revenueTrend } from '../services/metrics.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { emitStaff } from '../realtime/io.js';

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireRole('ADMIN'));

const qrToken = () => crypto.randomBytes(12).toString('base64url');
const tableUrl = (token) => `${config.publicWebUrl}/t/${token}`;

// ------------------------------------------------------------ categories
adminRoutes.get('/categories', asyncHandler(async (_req, res) => {
  const { rows } = await query(`
    SELECT c.*, COUNT(m.id)::int AS item_count
      FROM categories c LEFT JOIN menu_items m ON m.category_id = c.id
     GROUP BY c.id ORDER BY c.sort_order, c.name`);
  res.json({ categories: rows });
}));

const categoryBody = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(300).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

adminRoutes.post('/categories', validate(categoryBody), asyncHandler(async (req, res) => {
  const { name, description = '', sort_order = 0, is_active = true } = req.body;
  const { rows } = await query(
    `INSERT INTO categories (name, description, sort_order, is_active) VALUES ($1,$2,$3,$4) RETURNING *`,
    [name, description, sort_order, is_active],
  );
  res.status(201).json({ category: rows[0] });
}));

adminRoutes.patch('/categories/:id', validate(categoryBody.partial()), asyncHandler(async (req, res) => {
  const { name, description, sort_order, is_active } = req.body;
  const { rows } = await query(
    `UPDATE categories SET name = COALESCE($2, name), description = COALESCE($3, description),
            sort_order = COALESCE($4, sort_order), is_active = COALESCE($5, is_active)
      WHERE id = $1 RETURNING *`,
    [req.params.id, name ?? null, description ?? null, sort_order ?? null, is_active ?? null],
  );
  if (!rows[0]) throw notFound('Category not found');
  res.json({ category: rows[0] });
}));

adminRoutes.delete('/categories/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM menu_items WHERE category_id = $1', [req.params.id]);
  if (rows[0].n > 0) throw conflict('Move or delete this category\'s items first');
  await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ------------------------------------------------------------- menu items
adminRoutes.get('/menu-items', asyncHandler(async (req, res) => {
  const { rows } = await query(`
    SELECT m.*, c.name AS category_name,
      COALESCE(v.variants, '[]'::json) AS variants,
      COALESCE(a.addons,   '[]'::json) AS addons
    FROM menu_items m
    JOIN categories c ON c.id = m.category_id
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', mv.id, 'name', mv.name, 'price_delta', mv.price_delta,
                                        'is_default', mv.is_default, 'sort_order', mv.sort_order)
                      ORDER BY mv.sort_order) AS variants
      FROM menu_item_variants mv WHERE mv.menu_item_id = m.id) v ON true
    LEFT JOIN LATERAL (
      SELECT json_agg(json_build_object('id', ma.id, 'name', ma.name, 'price', ma.price,
                                        'is_active', ma.is_active) ORDER BY ma.sort_order) AS addons
      FROM menu_item_addons ma WHERE ma.menu_item_id = m.id) a ON true
    ${req.query.categoryId ? 'WHERE m.category_id = $1' : ''}
    ORDER BY c.sort_order, m.sort_order, m.name`,
  req.query.categoryId ? [req.query.categoryId] : []);
  res.json({ items: rows });
}));

const menuItemBody = z.object({
  category_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  price: z.number().int().min(0, 'Price cannot be negative'),
  image_url: z.string().url().max(500).nullable().optional(),
  food_type: z.enum(['VEG', 'NON_VEG', 'EGG', 'VEGAN']).optional(),
  is_available: z.boolean().optional(),
  is_active: z.boolean().optional(),
  is_recommended: z.boolean().optional(),
  spice_level: z.number().int().min(0).max(3).optional(),
  prep_minutes: z.number().int().min(0).max(240).optional(),
  kitchen_station: z.string().max(40).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  sort_order: z.number().int().optional(),
  variants: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    price_delta: z.number().int(),
    is_default: z.boolean().optional(),
  })).max(10).optional(),
  addons: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    price: z.number().int().min(0),
    is_active: z.boolean().optional(),
  })).max(20).optional(),
});

const MENU_FIELDS = ['category_id', 'name', 'description', 'price', 'image_url', 'food_type',
  'is_available', 'is_active', 'is_recommended', 'spice_level', 'prep_minutes',
  'kitchen_station', 'tags', 'sort_order'];

/** Variants and add-ons are replaced wholesale when supplied. */
async function replaceChildren(client, itemId, { variants, addons }) {
  if (variants) {
    await client.query('DELETE FROM menu_item_variants WHERE menu_item_id = $1', [itemId]);
    for (const [i, v] of variants.entries()) {
      await client.query(
        `INSERT INTO menu_item_variants (menu_item_id, name, price_delta, is_default, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [itemId, v.name, v.price_delta, v.is_default ?? i === 0, i],
      );
    }
  }
  if (addons) {
    await client.query('DELETE FROM menu_item_addons WHERE menu_item_id = $1', [itemId]);
    for (const [i, a] of addons.entries()) {
      await client.query(
        `INSERT INTO menu_item_addons (menu_item_id, name, price, is_active, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [itemId, a.name, a.price, a.is_active ?? true, i],
      );
    }
  }
}

adminRoutes.post('/menu-items', validate(menuItemBody), asyncHandler(async (req, res) => {
  const body = req.body;
  const item = await withTransaction(async (client) => {
    const fields = MENU_FIELDS.filter((f) => body[f] !== undefined);
    const { rows } = await client.query(
      `INSERT INTO menu_items (${fields.join(',')})
       VALUES (${fields.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
      fields.map((f) => body[f]),
    );
    await replaceChildren(client, rows[0].id, body);
    return rows[0];
  });
  emitStaff('menu:changed', { itemId: item.id });
  res.status(201).json({ item });
}));

adminRoutes.patch('/menu-items/:id', validate(menuItemBody.partial()), asyncHandler(async (req, res) => {
  const body = req.body;
  const item = await withTransaction(async (client) => {
    const fields = MENU_FIELDS.filter((f) => body[f] !== undefined);
    let row;
    if (fields.length) {
      const { rows } = await client.query(
        `UPDATE menu_items SET ${fields.map((f, i) => `${f} = $${i + 2}`).join(', ')}
          WHERE id = $1 RETURNING *`,
        [req.params.id, ...fields.map((f) => body[f])],
      );
      row = rows[0];
    } else {
      const { rows } = await client.query('SELECT * FROM menu_items WHERE id = $1', [req.params.id]);
      row = rows[0];
    }
    if (!row) throw notFound('Menu item not found');
    await replaceChildren(client, row.id, body);
    return row;
  });
  emitStaff('menu:changed', { itemId: item.id });
  res.json({ item });
}));

/** Quick 86-ing from the kitchen screen: flip availability without a full edit. */
adminRoutes.post('/menu-items/:id/availability',
  validate(z.object({ is_available: z.boolean() })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      'UPDATE menu_items SET is_available = $2 WHERE id = $1 RETURNING *',
      [req.params.id, req.body.is_available],
    );
    if (!rows[0]) throw notFound('Menu item not found');
    emitStaff('menu:changed', { itemId: rows[0].id });
    res.json({ item: rows[0] });
  }));

adminRoutes.delete('/menu-items/:id', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM order_items WHERE menu_item_id = $1', [req.params.id]);
  if (rows[0].n > 0) {
    // Keep history intact: retire the item instead of deleting it.
    const { rows: updated } = await query(
      'UPDATE menu_items SET is_active = false, is_available = false WHERE id = $1 RETURNING *',
      [req.params.id],
    );
    if (!updated[0]) throw notFound('Menu item not found');
    return res.json({ item: updated[0], archived: true });
  }
  await query('DELETE FROM menu_items WHERE id = $1', [req.params.id]);
  return res.json({ ok: true, archived: false });
}));

// ----------------------------------------------------------------- tables
adminRoutes.get('/tables', asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT * FROM dining_tables ORDER BY sort_order, code');
  res.json({ tables: rows.map((t) => ({ ...t, url: tableUrl(t.qr_token) })) });
}));

const tableBody = z.object({
  code: z.string().trim().min(1).max(20),
  label: z.string().trim().min(1).max(60),
  seats: z.number().int().min(1).max(50).optional(),
  zone: z.string().max(40).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

adminRoutes.post('/tables', validate(tableBody), asyncHandler(async (req, res) => {
  const { code, label, seats = 4, zone = 'Main', sort_order = 0 } = req.body;
  const { rows } = await query(
    `INSERT INTO dining_tables (code, label, seats, zone, qr_token, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [code, label, seats, zone, qrToken(), sort_order],
  );
  res.status(201).json({ table: { ...rows[0], url: tableUrl(rows[0].qr_token) } });
}));

/** Create a run of tables in one go — the usual way to set a cafe up. */
adminRoutes.post('/tables/bulk',
  validate(z.object({
    count: z.number().int().min(1).max(100),
    prefix: z.string().max(10).optional(),
    startAt: z.number().int().min(1).optional(),
    seats: z.number().int().min(1).max(50).optional(),
    zone: z.string().max(40).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { count, prefix = 'T', startAt = 1, seats = 4, zone = 'Main' } = req.body;
    const created = await withTransaction(async (client) => {
      const out = [];
      for (let i = 0; i < count; i += 1) {
        const n = startAt + i;
        const { rows } = await client.query(
          `INSERT INTO dining_tables (code, label, seats, zone, qr_token, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (code) DO NOTHING RETURNING *`,
          [`${prefix}${n}`, `Table ${n}`, seats, zone, qrToken(), n],
        );
        if (rows[0]) out.push({ ...rows[0], url: tableUrl(rows[0].qr_token) });
      }
      return out;
    });
    res.status(201).json({ tables: created, skipped: count - created.length });
  }));

adminRoutes.patch('/tables/:id', validate(tableBody.partial()), asyncHandler(async (req, res) => {
  const { code, label, seats, zone, is_active, sort_order } = req.body;
  const { rows } = await query(
    `UPDATE dining_tables SET code = COALESCE($2, code), label = COALESCE($3, label),
            seats = COALESCE($4, seats), zone = COALESCE($5, zone),
            is_active = COALESCE($6, is_active), sort_order = COALESCE($7, sort_order)
      WHERE id = $1 RETURNING *`,
    [req.params.id, code ?? null, label ?? null, seats ?? null, zone ?? null, is_active ?? null, sort_order ?? null],
  );
  if (!rows[0]) throw notFound('Table not found');
  res.json({ table: { ...rows[0], url: tableUrl(rows[0].qr_token) } });
}));

/** Rotate a table's QR — use when a printed code leaks or is misused. */
adminRoutes.post('/tables/:id/rotate-qr', asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE dining_tables SET qr_token = $2 WHERE id = $1 RETURNING *',
    [req.params.id, qrToken()],
  );
  if (!rows[0]) throw notFound('Table not found');
  res.json({ table: { ...rows[0], url: tableUrl(rows[0].qr_token) } });
}));

adminRoutes.delete('/tables/:id', asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM table_sessions WHERE table_id = $1`, [req.params.id],
  );
  if (rows[0].n > 0) {
    const { rows: updated } = await query(
      'UPDATE dining_tables SET is_active = false WHERE id = $1 RETURNING *', [req.params.id],
    );
    if (!updated[0]) throw notFound('Table not found');
    return res.json({ table: updated[0], archived: true });
  }
  await query('DELETE FROM dining_tables WHERE id = $1', [req.params.id]);
  return res.json({ ok: true, archived: false });
}));

/** QR image for a table, as a PNG data URL (ready to drop on a table tent). */
adminRoutes.get('/tables/:id/qr', asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM dining_tables WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Table not found');
  const url = tableUrl(rows[0].qr_token);
  const dataUrl = await QRCode.toDataURL(url, { width: 600, margin: 1, errorCorrectionLevel: 'M' });
  res.json({ table: rows[0], url, qr: dataUrl });
}));

adminRoutes.get('/tables/qr/all', asyncHandler(async (_req, res) => {
  const { rows } = await query('SELECT * FROM dining_tables WHERE is_active = true ORDER BY sort_order, code');
  const tables = await Promise.all(rows.map(async (t) => ({
    id: t.id, code: t.code, label: t.label, zone: t.zone,
    url: tableUrl(t.qr_token),
    qr: await QRCode.toDataURL(tableUrl(t.qr_token), { width: 600, margin: 1 }),
  })));
  res.json({ tables });
}));

// --------------------------------------------------------------- settings
adminRoutes.get('/settings', asyncHandler(async (_req, res) => {
  res.json({ settings: await getSettings() });
}));

adminRoutes.patch('/settings',
  validate(z.object({
    name: z.string().trim().min(1).max(120).optional(),
    address: z.string().max(300).optional(),
    phone: z.string().max(30).optional(),
    currency: z.string().max(5).optional(),
    currency_symbol: z.string().max(5).optional(),
    tax_label: z.string().max(20).optional(),
    tax_percent: z.number().min(0).max(100).optional(),
    service_charge_percent: z.number().min(0).max(100).optional(),
    tax_inclusive: z.boolean().optional(),
    round_bill_total: z.boolean().optional(),
    accept_orders: z.boolean().optional(),
    bill_footer_note: z.string().max(200).optional(),
  })),
  asyncHandler(async (req, res) => {
    const settings = await updateSettings(req.body);
    emitStaff('settings:changed', settings);
    res.json({ settings });
  }));

// ---------------------------------------------------------------- metrics
adminRoutes.get('/metrics/daily', asyncHandler(async (req, res) => {
  res.json(await dailyMetrics(req.query.date));
}));

adminRoutes.get('/metrics/trend', asyncHandler(async (req, res) => {
  res.json({ trend: await revenueTrend(req.query.days) });
}));
