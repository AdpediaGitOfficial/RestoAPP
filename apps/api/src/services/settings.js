import { query } from '../db/index.js';

export async function getSettings(client = null) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run('SELECT * FROM restaurant_settings WHERE id = 1');
  return rows[0];
}

export async function updateSettings(patch) {
  const allowed = [
    'name', 'address', 'phone', 'currency', 'currency_symbol', 'tax_label', 'tax_percent',
    'service_charge_percent', 'tax_inclusive', 'round_bill_total', 'accept_orders', 'bill_footer_note',
  ];
  const keys = Object.keys(patch).filter((k) => allowed.includes(k));
  if (!keys.length) return getSettings();
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  const { rows } = await query(
    `UPDATE restaurant_settings SET ${sets}, updated_at = now() WHERE id = 1 RETURNING *`,
    keys.map((k) => patch[k]),
  );
  return rows[0];
}
