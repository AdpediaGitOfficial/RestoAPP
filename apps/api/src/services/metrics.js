import { query } from '../db/index.js';

/** Default window: the current calendar day in the server's timezone. */
function dayRange(dateStr) {
  const start = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start, end];
}

/**
 * Everything the admin dashboard needs for one day, in a single round trip
 * per widget. Revenue is counted from SETTLED bills only — that is the
 * money actually collected.
 */
export async function dailyMetrics(dateStr) {
  const [from, to] = dayRange(dateStr);

  const [summary, hourly, topItems, categories, payments, staff, liveNow] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int                          AS bills_settled,
        COALESCE(SUM(b.total), 0)::int         AS revenue,
        COALESCE(SUM(b.subtotal), 0)::int      AS net_sales,
        COALESCE(SUM(b.tax_amount), 0)::int    AS tax_collected,
        COALESCE(SUM(b.service_charge_amount), 0)::int AS service_charge,
        COALESCE(SUM(b.discount_amount), 0)::int       AS discounts,
        COALESCE(SUM(s.guest_count), 0)::int   AS guests,
        COALESCE(ROUND(AVG(b.total)), 0)::int  AS average_bill
      FROM bills b JOIN table_sessions s ON s.id = b.session_id
      WHERE b.status = 'SETTLED' AND b.settled_at >= $1 AND b.settled_at < $2`, [from, to]),

    query(`
      SELECT EXTRACT(HOUR FROM b.settled_at)::int AS hour,
             COUNT(*)::int AS bills,
             COALESCE(SUM(b.total), 0)::int AS revenue
        FROM bills b
       WHERE b.status = 'SETTLED' AND b.settled_at >= $1 AND b.settled_at < $2
       GROUP BY 1 ORDER BY 1`, [from, to]),

    query(`
      SELECT oi.item_name,
             SUM(oi.quantity)::int   AS quantity,
             SUM(oi.line_total)::int AS revenue
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
         AND o.created_at >= $1 AND o.created_at < $2
       GROUP BY oi.item_name ORDER BY quantity DESC LIMIT 10`, [from, to]),

    query(`
      SELECT COALESCE(c.name, 'Uncategorised') AS category,
             SUM(oi.quantity)::int   AS quantity,
             SUM(oi.line_total)::int AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        LEFT JOIN categories c  ON c.id = mi.category_id
       WHERE o.status <> 'CANCELLED' AND oi.status <> 'CANCELLED'
         AND o.created_at >= $1 AND o.created_at < $2
       GROUP BY 1 ORDER BY revenue DESC`, [from, to]),

    query(`
      SELECT COALESCE(b.payment_method::text, 'UNKNOWN') AS method,
             COUNT(*)::int AS bills, COALESCE(SUM(b.total), 0)::int AS amount
        FROM bills b
       WHERE b.status = 'SETTLED' AND b.settled_at >= $1 AND b.settled_at < $2
       GROUP BY 1 ORDER BY amount DESC`, [from, to]),

    query(`
      SELECT u.name AS staff, COUNT(*)::int AS bills, COALESCE(SUM(b.total), 0)::int AS amount
        FROM bills b JOIN users u ON u.id = b.settled_by
       WHERE b.status = 'SETTLED' AND b.settled_at >= $1 AND b.settled_at < $2
       GROUP BY 1 ORDER BY amount DESC`, [from, to]),

    query(`
      SELECT
        (SELECT COUNT(*)::int FROM table_sessions WHERE status <> 'CLOSED')       AS open_tables,
        (SELECT COUNT(*)::int FROM table_sessions WHERE status = 'BILL_REQUESTED') AS bill_requests,
        (SELECT COUNT(*)::int FROM orders
          WHERE status = ANY('{PLACED,ACCEPTED,PREPARING}'::order_status[]))       AS orders_in_kitchen,
        (SELECT COALESCE(SUM(o.subtotal), 0)::int FROM orders o
           JOIN table_sessions s ON s.id = o.session_id
          WHERE s.status <> 'CLOSED' AND o.status <> 'CANCELLED')                  AS open_table_value`),
  ]);

  const orderStats = await query(`
    SELECT COUNT(*)::int AS orders_placed,
           COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS orders_cancelled,
           COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ready_at - created_at)) / 60)
             FILTER (WHERE ready_at IS NOT NULL)), 0)::int   AS avg_prep_minutes
      FROM orders WHERE created_at >= $1 AND created_at < $2`, [from, to]);

  return {
    date: from.toISOString().slice(0, 10),
    range: { from, to },
    summary: { ...summary.rows[0], ...orderStats.rows[0] },
    live: liveNow.rows[0],
    hourly: hourly.rows,
    topItems: topItems.rows,
    categories: categories.rows,
    payments: payments.rows,
    staff: staff.rows,
  };
}

/** Revenue per day for the trailing N days — drives the dashboard trend line. */
export async function revenueTrend(days = 14) {
  const { rows } = await query(`
    SELECT d::date AS date,
           COALESCE(SUM(b.total), 0)::int AS revenue,
           COUNT(b.id)::int               AS bills
      FROM generate_series(
             (current_date - ($1::int - 1)), current_date, interval '1 day') d
      LEFT JOIN bills b
        ON b.status = 'SETTLED' AND b.settled_at >= d AND b.settled_at < d + interval '1 day'
     GROUP BY d ORDER BY d`, [Math.min(Math.max(Number(days) || 14, 1), 90)]);
  return rows;
}
