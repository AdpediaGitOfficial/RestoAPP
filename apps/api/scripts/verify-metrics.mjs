#!/usr/bin/env node
/**
 * Prove the analytics SQL agrees with reality, against a live database.
 *
 * Unit tests cannot catch the failure that matters most here: a report that
 * buckets a 7pm dinner into the 13:00 slot because the server runs UTC and
 * the restaurant does not. That bug produces a plausible chart pointing at
 * the wrong service, which is worse than an obviously broken one.
 *
 * So this seeds orders at wall-clock times we choose, in the restaurant's own
 * timezone, and asserts they come back out of the API in the hours we put
 * them.
 *
 * The seed has to be COMMITTED: the service functions run on their own pooled
 * connection and cannot see an open transaction on another one. (An earlier
 * version of this script seeded inside a transaction and silently measured
 * whatever was already in the database instead.) So it commits, verifies, and
 * then deletes exactly what it created in a finally block — the session row
 * cascades to its orders and their items.
 *
 *   node scripts/verify-metrics.mjs
 */
import { pool, query } from '../src/db/index.js';
import { itemProfile, overview, topItems, resolveRange } from '../src/services/metrics.js';
import { getSettings } from '../src/services/settings.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

// The shape we plant: a lunch peak at 13:00 and a bigger dinner peak at 20:00.
const PLAN = { 11: 3, 12: 7, 13: 13, 14: 10, 15: 2, 16: 1, 17: 2, 18: 4, 19: 8, 20: 15, 21: 9 };

let sessionId = null;

try {
  const settings = await getSettings();
  const tz = settings.timezone;
  console.log(`restaurant timezone: ${tz}`);
  console.log(`server timezone    : ${Intl.DateTimeFormat().resolvedOptions().timeZone}\n`);

  const { rows: [table] } = await query('SELECT id FROM dining_tables ORDER BY sort_order LIMIT 1');
  const { rows: [menuItem] } = await query('SELECT id, name, price FROM menu_items ORDER BY name LIMIT 1');
  if (!table || !menuItem) throw new Error('needs at least one table and one menu item — run db:seed');

  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);

  const { rows: [session] } = await query(
    `INSERT INTO table_sessions (table_id, code, status, guest_count, opened_at, closed_at)
     VALUES ($1, $2, 'CLOSED', 2, now() - interval '2 days', now() - interval '2 days' + interval '2 hours')
     RETURNING id`, [table.id, `VERIFY-${Date.now().toString(36)}`]);
  sessionId = session.id;

  for (const [hour, qty] of Object.entries(PLAN)) {
    // Yesterday at HH:30, expressed in the RESTAURANT's wall clock.
    const at = `(($1::date)::text || ' ' || lpad($2::text, 2, '0') || ':30')::timestamp AT TIME ZONE $3`;
    const { rows: [order] } = await query(
      `INSERT INTO orders (session_id, table_id, order_number, status, subtotal, created_at)
       VALUES ($4, $5, nextval('order_number_seq'), 'SERVED', $6, ${at}) RETURNING id`,
      [yesterday, hour, tz, sessionId, table.id, qty * menuItem.price]);
    await query(
      `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, line_total, status, created_at)
       VALUES ($4, $5, $6, $7, $8, $9, 'SERVED', ${at})`,
      [yesterday, hour, tz, order.id, menuItem.id, menuItem.name, menuItem.price, qty, qty * menuItem.price]);
  }

  // Measure only what this run planted, so pre-existing trade cannot mask a
  // bucketing error (or, worse, accidentally reproduce the expected shape).
  const { rows: baseline } = await query(
    `SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE $3)::int AS hour,
            SUM(oi.quantity)::int AS quantity
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.menu_item_id = $1 AND o.session_id <> $2
        AND o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
        AND o.created_at >= (($4::date)::text || ' 00:00')::timestamp AT TIME ZONE $3
        AND o.created_at <  (($4::date)::text || ' 00:00')::timestamp AT TIME ZONE $3 + interval '1 day'
      GROUP BY 1`, [menuItem.id, sessionId, tz, yesterday]);
  const other = Object.fromEntries(baseline.map((r) => [r.hour, r.quantity]));
  const otherTotal = baseline.reduce((a, r) => a + r.quantity, 0);
  if (otherTotal) console.log(`(${otherTotal} unit(s) of ${menuItem.name} already on the books yesterday; subtracted)\n`);

  // ---- the headline claim: hours come back where they were put ------------
  const profile = await itemProfile({ period: 'yesterday' }, menuItem.id);
  const got = Object.fromEntries(profile.hourly.map((h) => [h.hour, h.quantity]));
  const mine = (hour) => (got[hour] ?? 0) - (other[hour] ?? 0);

  for (const [hour, qty] of Object.entries(PLAN)) {
    check(`hour ${String(hour).padStart(2, '0')}:00 holds ${qty}`, mine(hour) === qty,
      mine(hour) === qty ? '' : `got ${mine(hour)}`);
  }

  check('nothing landed in an hour we did not seed',
    Object.keys(got).every((h) => PLAN[h] !== undefined || (other[h] ?? 0) === got[h]));

  const planned = Object.values(PLAN).reduce((a, b) => a + b, 0);
  check('every unit is accounted for', profile.item.quantity - otherTotal === planned,
    `${profile.item.quantity - otherTotal} of ${planned}`);

  check('peak is the 20:00 dinner rush', profile.peak_hour === 20, `got ${profile.peak_hour}`);
  check('peak is labelled for people', profile.peak_label === '8 PM', `got ${profile.peak_label}`);

  // The axis keeps the quiet middle and stops at the last hour traded.
  check('a quiet trading hour is kept, not closed up',
    profile.hourly.some((h) => h.hour === 16), 'hour 16 present');

  // The axis must be evenly spaced in time. Dropping an hour with no sales
  // draws 3pm next to 9pm as though they were adjacent, which is the kind of
  // wrong that still looks like a chart.
  const gaps = profile.hourly.slice(1).map((h, i) => h.hour - profile.hourly[i].hour);
  check('the hour axis has no missing hours', gaps.every((g) => g === 1),
    `steps ${[...new Set(gaps)].join(',')}`);
  check('the axis spans every hour between first and last trade',
    profile.hourly.length === profile.hourly.at(-1).hour - profile.hourly[0].hour + 1,
    `${profile.hourly.length} rows for ${profile.hourly[0].hour}-${profile.hourly.at(-1).hour}`);
  check('the axis carries no empty night',
    profile.hourly.every((h) => h.hour >= 11 && h.hour <= 21),
    `${profile.hourly[0]?.hour}-${profile.hourly.at(-1)?.hour}`);

  // ---- the day boundary is the restaurant's, not the server's -------------
  const range = await resolveRange({ period: 'today' }, tz);
  const { rows: [{ local }] } = await query(
    `SELECT to_char($1::timestamptz AT TIME ZONE $2, 'HH24:MI') AS local`, [range.from, tz]);
  check('a day begins at local midnight', local === '00:00', `starts ${local} local`);

  const { rows: [{ hours }] } = await query(
    'SELECT EXTRACT(EPOCH FROM ($2::timestamptz - $1::timestamptz)) / 3600 AS hours',
    [range.from, range.to]);
  check('a day is 24 hours long', Number(hours) === 24, `${hours}h`);

  // ---- a partial window is compared against the same slice ---------------
  const { rows: [{ same }] } = await query(
    `SELECT ($2::timestamptz - $1::timestamptz) = ($4::timestamptz - $3::timestamptz) AS same`,
    [range.from, range.end, range.previous.from, range.previous.end]);
  check('today so far is compared with yesterday to the same clock time', same === true);

  // ---- malformed input is answered, not crashed --------------------------
  const backwards = await resolveRange({ period: 'custom', from: '2026-09-26', to: '2026-09-01' }, tz);
  check('a backwards custom range is read the right way round',
    new Date(backwards.to) > new Date(backwards.from),
    `${String(backwards.from).slice(0,10)} -> ${String(backwards.to).slice(0,10)}`);

  const junk = await resolveRange({ period: 'custom', from: 'not-a-date', to: yesterday }, tz);
  check('an unparseable date falls back instead of failing', junk.period === 'today', junk.period);

  const missing = await itemProfile({ period: '30d' }, 'a'.repeat(36));
  check('a 36-character dish name is not mistaken for an id', missing.item.quantity === 0);

  const unknown = await itemProfile({ period: '30d' }, 'No Such Dish');
  check('an unknown dish returns an empty profile, not an error',
    unknown.item.quantity === 0 && unknown.peak_hour === null);

  // ---- shares are a share of something -----------------------------------
  const items = await topItems({ period: 'yesterday' }, 100);
  const shareSum = items.items.reduce((a, i) => a + i.share_quantity, 0);
  check('item shares total ~100%', Math.abs(shareSum - 100) < 1.5, `${shareSum.toFixed(1)}%`);

  // ---- an abandoned table does not read as an occupied one ---------------
  // A session the sweep closed sat open long after its guests left. Counting
  // it to closed_at pins occupancy at 100% for every window it touches.
  const { rows: [spans] } = await query(`
    SELECT COUNT(*)::int AS auto_closed,
           COUNT(*) FILTER (WHERE closed_at > last_activity + interval '1 minute')::int AS shortened,
           COUNT(*) FILTER (WHERE last_activity > closed_at)::int AS impossible
      FROM (
        SELECT s.closed_at,
               GREATEST(s.opened_at, COALESCE(
                 (SELECT MAX(o.created_at) FROM orders o WHERE o.session_id = s.id), s.opened_at)) AS last_activity
          FROM table_sessions s WHERE s.close_reason IS NOT NULL
      ) x`);
  if (spans.auto_closed) {
    check('a swept session stops counting at its last activity, not at the sweep',
      spans.shortened > 0, `${spans.shortened} of ${spans.auto_closed} shortened`);
    check('no session counts occupancy past the moment it closed', spans.impossible === 0);
  } else {
    console.log('SKIP  abandoned-span checks (no auto-closed sessions on this database)');
  }

  // ---- occupancy is a percentage, always ---------------------------------
  for (const period of ['today', 'yesterday', '7d', '30d']) {
    const o = await overview({ period });
    const occ = o.kpis.find((k) => k.key === 'occupancy').value;
    check(`occupancy is within 0-100 for ${period}`, occ >= 0 && occ <= 100, `${occ}%`);
  }
} catch (err) {
  console.error('\nverification aborted:', err.message);
  failures++;
} finally {
  if (sessionId) {
    // Cascades to the orders and their items.
    await query('DELETE FROM table_sessions WHERE id = $1', [sessionId]).catch(() => {});
    console.log('\n(seeded rows removed)');
  }
  await pool.end();
}

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
