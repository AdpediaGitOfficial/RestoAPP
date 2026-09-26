import { query } from '../db/index.js';
import { getSettings } from './settings.js';
import { pctChange, trendOf, tradingHours, hourLabel, looksLikeUuid } from '../lib/reporting.js';

/**
 * Reporting for the owner's dashboard.
 *
 * Two rules run through all of it:
 *
 *  1. Days and hours are bucketed in the RESTAURANT's timezone, never the
 *     server's. A cloud box runs UTC; a café in India does not. Getting this
 *     wrong does not produce an obviously broken chart, it produces a
 *     plausible one that points at the wrong service.
 *
 *  2. Every headline number carries a comparison against the previous
 *     equivalent window, and a partial window is compared against the same
 *     slice of the previous one. Half of today against all of yesterday is
 *     always down by lunchtime, which trains owners to ignore the arrows.
 */

const PERIODS = new Set(['today', 'yesterday', '7d', '30d', 'custom']);

/** ISO date (YYYY-MM-DD) or nothing. Anything else is rejected, not coerced. */
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Turn a period name into two concrete windows — the one asked for and the
 * one to compare it against — both resolved in the restaurant's timezone.
 *
 * Postgres does the arithmetic because it owns the tz database; doing it in
 * JavaScript means reimplementing daylight saving badly.
 */
export async function resolveRange({ period = 'today', from, to } = {}, tz) {
  if (!PERIODS.has(period)) period = 'today';
  if (period === 'custom' && !(isDate(from) && isDate(to))) period = 'today';
  // A backwards range is a slip, not a request for nothing. Reading it either
  // way round beats silently reporting zeroes for a window that cannot exist.
  if (period === 'custom' && from > to) [from, to] = [to, from];
  // Only a custom window may carry dates. Postgres folds the date cast in the
  // CASE arm it never takes, so an unparseable value left in $3 fails the
  // whole statement even when the period has fallen back to today.
  const fromArg = period === 'custom' ? from : null;
  const toArg = period === 'custom' ? to : null;

  // `now() AT TIME ZONE tz` gives local wall-clock time; truncating that to a
  // day and converting back yields the instant local midnight actually was.
  const { rows } = await query(
    `
    WITH z AS (SELECT $1::text AS tz),
    base AS (
      SELECT (date_trunc('day', now() AT TIME ZONE tz) AT TIME ZONE tz) AS today,
             now() AS now_ts,
             tz
        FROM z
    ),
    win AS (
      SELECT
        CASE $2
          WHEN 'today'     THEN today
          WHEN 'yesterday' THEN today - interval '1 day'
          WHEN '7d'        THEN today - interval '6 days'
          WHEN '30d'       THEN today - interval '29 days'
          ELSE ($3::date::text || ' 00:00')::timestamp AT TIME ZONE tz
        END AS w_from,
        CASE $2
          WHEN 'today'     THEN today + interval '1 day'
          WHEN 'yesterday' THEN today
          WHEN '7d'        THEN today + interval '1 day'
          WHEN '30d'       THEN today + interval '1 day'
          ELSE (($4::date + 1)::text || ' 00:00')::timestamp AT TIME ZONE tz
        END AS w_to,
        now_ts, tz
      FROM base
    )
    SELECT
      w_from, w_to, tz,
      -- A window that has not finished is only measured as far as it has run.
      LEAST(w_to, now_ts) AS w_end,
      -- The comparison window is the same length, immediately before.
      w_from - (w_to - w_from) AS p_from,
      w_from                   AS p_to,
      -- ...and truncated to the same elapsed fraction, so a half-finished
      -- today is compared against half of yesterday.
      w_from - (w_to - w_from) + (LEAST(w_to, now_ts) - w_from) AS p_end
    FROM win`,
    [tz, period, fromArg, toArg],
  );

  const r = rows[0];
  return {
    period,
    tz,
    from: r.w_from,
    to: r.w_to,
    end: r.w_end,
    previous: { from: r.p_from, to: r.p_to, end: r.p_end },
  };
}

/** The money and covers for one window. Revenue counts SETTLED bills only. */
async function windowTotals(from, end) {
  const { rows } = await query(
    `
    SELECT
      COALESCE(SUM(b.total), 0)::int                  AS gross_sales,
      COALESCE(SUM(b.subtotal - b.discount_amount), 0)::int AS net_sales,
      COALESCE(SUM(b.tax_amount), 0)::int             AS tax,
      COALESCE(SUM(b.service_charge_amount), 0)::int  AS service_charge,
      COALESCE(SUM(b.discount_amount), 0)::int        AS discounts,
      COUNT(*)::int                                   AS bills,
      COALESCE(SUM(s.guest_count), 0)::int            AS covers,
      COALESCE(ROUND(AVG(b.total)), 0)::int           AS average_bill
    FROM bills b JOIN table_sessions s ON s.id = b.session_id
    WHERE b.status = 'SETTLED' AND b.settled_at >= $1 AND b.settled_at < $2`,
    [from, end],
  );
  const { rows: ord } = await query(
    `SELECT COUNT(*)::int AS orders,
            COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled
       FROM orders WHERE created_at >= $1 AND created_at < $2`,
    [from, end],
  );
  // There are no refunds in this system — a bill is either settled or voided
  // before payment — so the dashboard reports voids and says so.
  const { rows: voided } = await query(
    `SELECT COUNT(*)::int AS voided_bills, COALESCE(SUM(total), 0)::int AS voided_value
       FROM bills WHERE status = 'VOID' AND voided_at >= $1 AND voided_at < $2`,
    [from, end],
  );
  return { ...rows[0], ...ord[0], ...voided[0] };
}

/**
 * Share of the period a table was occupied: occupied table-minutes over the
 * table-minutes available. Only elapsed time counts, so a window that is
 * still running is not diluted by hours that have not happened yet.
 */
async function occupancy(from, end) {
  const { rows } = await query(
    `
    WITH active AS (SELECT COUNT(*)::int AS n FROM dining_tables WHERE is_active),
    spans AS (
      -- Only tables that count toward the denominator may count toward the
      -- numerator; a session on a retired table would otherwise push the
      -- figure past 100%.
      --
      -- A session the sweep closed was not occupied until the sweep ran — it
      -- was occupied until the guests stopped ordering, and then sat open
      -- because nobody closed it. close_reason says the timestamp cannot be
      -- taken at face value, so the span ends at the last real activity
      -- instead. Without this one abandoned table reads as 100% occupancy
      -- for every window it touches, which is as long as thirty days.
      SELECT s.opened_at AS started,
             CASE
               WHEN s.close_reason IS NOT NULL
                 THEN GREATEST(s.opened_at, COALESCE(
                        (SELECT MAX(o.created_at) FROM orders o WHERE o.session_id = s.id),
                        s.opened_at))
               ELSE COALESCE(s.closed_at, now())
             END AS ended
        FROM table_sessions s
        JOIN dining_tables t ON t.id = s.table_id AND t.is_active
    ),
    used AS (
      SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (
               LEAST(ended, $2::timestamptz) - GREATEST(started, $1::timestamptz)))), 0) AS seconds
        FROM spans
       WHERE started < $2 AND ended > $1
    )
    SELECT CASE
             WHEN active.n = 0 OR $2::timestamptz <= $1::timestamptz THEN 0
             ELSE LEAST(100, ROUND(
               used.seconds / (active.n * EXTRACT(EPOCH FROM ($2::timestamptz - $1::timestamptz))) * 1000
             ) / 10)
           END::numeric AS pct
      FROM active, used`,
    [from, end],
  );
  return Number(rows[0].pct);
}

/** The headline tiles, each with its change against the previous window. */
export async function overview(rangeInput = {}) {
  const settings = await getSettings();
  const range = await resolveRange(rangeInput, settings.timezone);

  const [now, before, occNow, occBefore, live] = await Promise.all([
    windowTotals(range.from, range.end),
    windowTotals(range.previous.from, range.previous.end),
    occupancy(range.from, range.end),
    occupancy(range.previous.from, range.previous.end),
    query(`
      SELECT
        (SELECT COUNT(*)::int FROM table_sessions WHERE status <> 'CLOSED')        AS open_tables,
        (SELECT COUNT(*)::int FROM table_sessions WHERE status = 'BILL_REQUESTED') AS bill_requests,
        (SELECT COUNT(*)::int FROM bills WHERE status = 'DRAFT')                   AS pending_bills,
        (SELECT COUNT(*)::int FROM orders
          WHERE status = ANY('{PLACED,ACCEPTED,PREPARING}'::order_status[]))        AS orders_in_kitchen,
        (SELECT COALESCE(SUM(o.subtotal), 0)::int FROM orders o
           JOIN table_sessions s ON s.id = o.session_id
          WHERE s.status <> 'CLOSED' AND o.status <> 'CANCELLED')                   AS open_table_value`),
  ]);

  const kpi = (key, value, previous, opts = {}) => ({
    key, value, previous, change: pctChange(value, previous), ...opts,
  });

  return {
    range,
    currency_symbol: settings.currency_symbol,
    kpis: [
      kpi('gross_sales', now.gross_sales, before.gross_sales, { format: 'money', label: 'Gross sales' }),
      kpi('net_sales', now.net_sales, before.net_sales, { format: 'money', label: 'Net sales' }),
      kpi('orders', now.orders, before.orders, { format: 'count', label: 'Orders' }),
      kpi('average_bill', now.average_bill, before.average_bill, { format: 'money', label: 'Avg. order' }),
      kpi('covers', now.covers, before.covers, { format: 'count', label: 'Covers' }),
      kpi('occupancy', occNow, occBefore, { format: 'percent', label: 'Table occupancy' }),
      // For these three, up is bad — the UI inverts the colour, not the sign.
      kpi('cancelled', now.cancelled, before.cancelled, { format: 'count', label: 'Cancelled', lowerIsBetter: true }),
      kpi('voided_value', now.voided_value, before.voided_value, { format: 'money', label: 'Voided bills', lowerIsBetter: true }),
      kpi('pending_bills', live.rows[0].pending_bills, null, { format: 'count', label: 'Pending bills', live: true }),
    ],
    totals: now,
    live: live.rows[0],
  };
}

/**
 * Best sellers, with each item's share of everything sold and its movement
 * against the previous window. Grouped by menu_item_id where there is one, so
 * a renamed dish keeps its history; items off a deleted menu fall back to the
 * name snapshotted on the order line.
 */
export async function topItems(rangeInput = {}, limit = 10) {
  const settings = await getSettings();
  const range = await resolveRange(rangeInput, settings.timezone);
  const cap = Math.min(Math.max(Number(limit) || 10, 1), 100);

  const { rows } = await query(
    `
    WITH sold AS (
      SELECT COALESCE(oi.menu_item_id::text, oi.item_name) AS key,
             MIN(oi.item_name)         AS item_name,
             MIN(oi.menu_item_id::text) AS menu_item_id,
             SUM(oi.quantity)::int     AS quantity,
             SUM(oi.line_total)::int   AS revenue,
             COUNT(DISTINCT o.id)::int AS orders
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
         AND o.created_at >= $1 AND o.created_at < $2
       GROUP BY 1
    ),
    prev AS (
      SELECT COALESCE(oi.menu_item_id::text, oi.item_name) AS key,
             SUM(oi.quantity)::int   AS quantity,
             SUM(oi.line_total)::int AS revenue
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
         AND o.created_at >= $3 AND o.created_at < $4
       GROUP BY 1
    ),
    totals AS (SELECT NULLIF(SUM(quantity), 0) AS qty, NULLIF(SUM(revenue), 0) AS rev FROM sold)
    SELECT s.item_name, s.menu_item_id, s.quantity, s.revenue, s.orders,
           COALESCE(p.quantity, 0)::int AS previous_quantity,
           COALESCE(p.revenue, 0)::int  AS previous_revenue,
           ROUND(s.quantity  * 100.0 / totals.qty, 1)::numeric AS share_quantity,
           ROUND(s.revenue   * 100.0 / totals.rev, 1)::numeric AS share_revenue
      FROM sold s
      LEFT JOIN prev p ON p.key = s.key
      CROSS JOIN totals
     ORDER BY s.quantity DESC, s.revenue DESC
     LIMIT $5`,
    [range.from, range.end, range.previous.from, range.previous.end, cap],
  );

  return {
    range,
    currency_symbol: settings.currency_symbol,
    items: rows.map((r) => ({
      ...r,
      share_quantity: Number(r.share_quantity),
      share_revenue: Number(r.share_revenue),
      change: pctChange(r.quantity, r.previous_quantity),
      trend: trendOf(r.quantity, r.previous_quantity),
    })),
  };
}

/**
 * When one dish actually sells — the question the owner is really asking.
 *
 * Returns the hour-of-day profile across the window, so a lunch-and-dinner
 * item shows two humps and the kitchen can prep against them. Hours are in
 * the restaurant's timezone; every hour 0-23 is present so the chart has no
 * gaps to misread.
 */
export async function itemProfile(rangeInput = {}, itemKey) {
  if (!itemKey) throw new Error('itemProfile needs an item');
  const settings = await getSettings();
  const range = await resolveRange(rangeInput, settings.timezone);
  const tz = settings.timezone;

  // The key is a menu_item_id when the dish is still on the menu, and the
  // snapshotted name when it is not. The shape has to be checked properly:
  // "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" is 36 characters of hex, and a
  // looser test sent it to the uuid cast, which failed the request outright.
  const match = looksLikeUuid(itemKey) ? 'oi.menu_item_id = $3::uuid' : 'oi.item_name = $3';

  const [hourly, weekday, totals] = await Promise.all([
    query(
      `
      -- Aggregate per hour FIRST, then hang the result off the full series.
      -- Joining the rows to the series and filtering afterwards drops any
      -- hour with no sales, which collapses the axis: 3pm ends up drawn
      -- next to 9pm as though they were an hour apart.
      WITH hours AS (SELECT generate_series(0, 23) AS hour),
      sold AS (
        SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE $4)::int AS hour,
               SUM(oi.quantity)::int   AS quantity,
               SUM(oi.line_total)::int AS revenue
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE ${match} AND oi.status <> 'CANCELLED' AND o.status <> 'CANCELLED'
           AND o.created_at >= $1 AND o.created_at < $2
         GROUP BY 1
      )
      SELECT hours.hour,
             COALESCE(sold.quantity, 0) AS quantity,
             COALESCE(sold.revenue, 0)  AS revenue
        FROM hours LEFT JOIN sold ON sold.hour = hours.hour
       ORDER BY hours.hour`,
      [range.from, range.end, itemKey, tz],
    ),
    query(
      `
      WITH days AS (SELECT generate_series(0, 6) AS dow),
      sold AS (
        SELECT EXTRACT(DOW FROM o.created_at AT TIME ZONE $4)::int AS dow,
               SUM(oi.quantity)::int AS quantity
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE ${match} AND oi.status <> 'CANCELLED' AND o.status <> 'CANCELLED'
           AND o.created_at >= $1 AND o.created_at < $2
         GROUP BY 1
      )
      SELECT days.dow, COALESCE(sold.quantity, 0) AS quantity
        FROM days LEFT JOIN sold ON sold.dow = days.dow
       ORDER BY days.dow`,
      [range.from, range.end, itemKey, tz],
    ),
    query(
      `SELECT MIN(oi.item_name) AS item_name,
              COALESCE(SUM(oi.quantity), 0)::int   AS quantity,
              COALESCE(SUM(oi.line_total), 0)::int AS revenue,
              COUNT(DISTINCT o.id)::int            AS orders
         FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE ${match} AND o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
          AND o.created_at >= $1 AND o.created_at < $2`,
      [range.from, range.end, itemKey],
    ),
  ]);

  const trading = tradingHours(hourly.rows, (r) => r.quantity);
  const peak = trading.length ? trading.reduce((a, b) => (b.quantity > a.quantity ? b : a)) : null;

  return {
    range,
    currency_symbol: settings.currency_symbol,
    item: { key: itemKey, ...totals.rows[0] },
    // Only the hours the kitchen was actually trading in; the full 24 is
    // mostly empty night and flattens the shape the owner is looking for.
    hourly: trading.map((r) => ({ ...r, label: hourLabel(r.hour), short_label: hourLabel(r.hour, true) })),
    weekday: weekday.rows,
    peak_hour: peak ? peak.hour : null,
    peak_label: peak ? hourLabel(peak.hour) : null,
  };
}

/** Overall trade by hour of day, in the restaurant's timezone. */
export async function hourlyProfile(rangeInput = {}) {
  const settings = await getSettings();
  const range = await resolveRange(rangeInput, settings.timezone);
  const { rows } = await query(
    `
    WITH hours AS (SELECT generate_series(0, 23) AS hour)
    SELECT hours.hour,
           COUNT(b.id)::int                AS bills,
           COALESCE(SUM(b.total), 0)::int  AS revenue,
           COALESCE(SUM(s.guest_count), 0)::int AS covers
      FROM hours
      LEFT JOIN bills b ON b.status = 'SETTLED'
           AND b.settled_at >= $1 AND b.settled_at < $2
           AND EXTRACT(HOUR FROM b.settled_at AT TIME ZONE $3)::int = hours.hour
      LEFT JOIN table_sessions s ON s.id = b.session_id
     GROUP BY hours.hour ORDER BY hours.hour`,
    [range.from, range.end, settings.timezone],
  );
  const trading = tradingHours(rows, (r) => r.revenue);
  return {
    range,
    // Only the hours the restaurant traded in, labelled once here so the
    // chart, the tooltip and any export all name an hour the same way.
    hourly: trading.map((r) => ({ ...r, label: hourLabel(r.hour), short_label: hourLabel(r.hour, true) })),
  };
}

/** How the window splits by category, payment method and who settled it. */
export async function breakdowns(rangeInput = {}) {
  const settings = await getSettings();
  const range = await resolveRange(rangeInput, settings.timezone);
  const [categories, payments, staff] = await Promise.all([
    query(
      `SELECT COALESCE(c.name, 'Uncategorised') AS category,
              SUM(oi.quantity)::int AS quantity, SUM(oi.line_total)::int AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         LEFT JOIN categories c  ON c.id = mi.category_id
        WHERE o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
          AND o.created_at >= $1 AND o.created_at < $2
        GROUP BY 1 ORDER BY revenue DESC`, [range.from, range.end]),
    query(
      `SELECT COALESCE(payment_method::text, 'UNKNOWN') AS method,
              COUNT(*)::int AS bills, COALESCE(SUM(total), 0)::int AS amount
         FROM bills WHERE status = 'SETTLED' AND settled_at >= $1 AND settled_at < $2
        GROUP BY 1 ORDER BY amount DESC`, [range.from, range.end]),
    query(
      `SELECT u.name AS staff, COUNT(*)::int AS bills, COALESCE(SUM(b.total), 0)::int AS amount
         FROM bills b JOIN users u ON u.id = b.settled_by
        WHERE b.status = 'SETTLED' AND b.settled_at >= $1 AND b.settled_at < $2
        GROUP BY 1 ORDER BY amount DESC`, [range.from, range.end]),
  ]);
  return { range, categories: categories.rows, payments: payments.rows, staff: staff.rows };
}

/** Revenue per day across the window — the trend line under the tiles. */
export async function revenueTrend(rangeInput = {}) {
  const settings = await getSettings();
  const range = await resolveRange(rangeInput, settings.timezone);
  const { rows } = await query(
    `
    SELECT (d AT TIME ZONE $3)::date AS date,
           COALESCE(SUM(b.total), 0)::int AS revenue,
           COUNT(b.id)::int               AS bills
      FROM generate_series($1::timestamptz, $2::timestamptz - interval '1 second', interval '1 day') d
      LEFT JOIN bills b
        ON b.status = 'SETTLED'
       AND b.settled_at >= d AND b.settled_at < d + interval '1 day'
     GROUP BY 1 ORDER BY 1`,
    [range.from, range.to, settings.timezone],
  );
  return { range, trend: rows };
}

/**
 * The whole dashboard in one round trip. The browser asks once per period
 * change rather than firing six requests that each re-resolve the window.
 */
export async function dashboard(rangeInput = {}, { itemKey = null } = {}) {
  const [head, items, hours, splits, trend] = await Promise.all([
    overview(rangeInput),
    topItems(rangeInput, 10),
    hourlyProfile(rangeInput),
    breakdowns(rangeInput),
    revenueTrend(rangeInput),
  ]);
  // Default the item chart to whatever sells most, so the panel is never empty.
  const key = itemKey || items.items[0]?.menu_item_id || items.items[0]?.item_name;
  const item = key ? await itemProfile(rangeInput, key) : null;
  return {
    ...head,
    topItems: items.items,
    hourly: hours.hourly,
    categories: splits.categories,
    payments: splits.payments,
    staff: splits.staff,
    trend: trend.trend,
    itemProfile: item,
  };
}

/** Kept for the existing daily view; now correct about what a day is. */
export async function dailyMetrics(dateStr) {
  const range = isDate(dateStr) ? { period: 'custom', from: dateStr, to: dateStr } : { period: 'today' };
  return dashboard(range);
}
