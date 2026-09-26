import { query, withTransaction } from '../db/index.js';
import { getSettings } from './settings.js';
import { emitStaff, emitTo } from '../realtime/io.js';

/**
 * Sweeping abandoned table sessions shut.
 *
 * The rule the whole thing turns on: staleness is measured from the last
 * thing that happened on the table, never from when it opened. A party three
 * hours into a long dinner has an old session and a recent order; an
 * abandoned table has both old. Using `opened_at` would close the first one
 * mid-meal, which is the failure this must not have — a guest whose session
 * is closed under them cannot order another round, and nobody on the floor
 * would know why.
 *
 * Two thresholds, because two different things go wrong:
 *
 *   - A session with no orders at all is a scan that went nowhere. Minutes.
 *   - A session with orders may be owed money, so it waits far longer, and
 *     what it was owed is recorded when it closes.
 *
 * Nothing here cancels an order or deletes a bill. Orders still on the
 * kitchen board are marked served — they were cooked, and leaving them
 * queued keeps yesterday's tickets on today's display.
 */

export const REASONS = {
  EMPTY: 'AUTO_EMPTY',   // scanned, never ordered
  IDLE: 'AUTO_IDLE',     // ordered, then nothing for a long time
};

/**
 * Sessions the sweep would close, with what is on them.
 *
 * Safe to call at any time: it only reads. The admin screen uses it as a
 * preview so nobody has to run the sweep to find out what it would do.
 */
export async function findStaleSessions({ emptyMinutes, idleMinutes } = {}) {
  const settings = await getSettings();
  const empty = Number(emptyMinutes ?? settings.auto_close_empty_minutes);
  const idle = Number(idleMinutes ?? settings.auto_close_idle_minutes);

  const { rows } = await query(
    `
    WITH live AS (
      SELECT s.id, s.code, s.status, s.opened_at, s.guest_count, s.table_id,
             t.label AS table_label,
             COUNT(o.id) FILTER (WHERE o.status <> 'CANCELLED')::int AS orders,
             -- The clock runs from the last thing that happened here, which
             -- is the newest order if there is one and the seating if not.
             GREATEST(s.opened_at, COALESCE(MAX(o.created_at), s.opened_at)) AS last_activity,
             COALESCE(SUM(o.subtotal) FILTER (WHERE o.status <> 'CANCELLED'), 0)::int AS ordered_value,
             COUNT(*) FILTER (WHERE o.status = ANY('{PLACED,ACCEPTED,PREPARING,READY}'::order_status[]))::int AS open_tickets
        FROM table_sessions s
        JOIN dining_tables t ON t.id = s.table_id
        LEFT JOIN orders o ON o.session_id = s.id
       WHERE s.status <> 'CLOSED'
       GROUP BY s.id, t.label
    )
    SELECT live.*,
           EXTRACT(EPOCH FROM (now() - last_activity))::int / 60 AS idle_minutes,
           CASE WHEN orders = 0 THEN $1::int ELSE $2::int END AS threshold_minutes,
           CASE WHEN orders = 0 THEN '${REASONS.EMPTY}' ELSE '${REASONS.IDLE}' END AS reason,
           -- Anything settled on this session is money already taken; only
           -- what is left over is stranded by closing it.
           GREATEST(ordered_value - COALESCE((
             SELECT SUM(b.subtotal)::int FROM bills b
              WHERE b.session_id = live.id AND b.status = 'SETTLED'), 0), 0) AS unbilled_value
      FROM live
     WHERE now() - last_activity > make_interval(mins => CASE WHEN orders = 0 THEN $1::int ELSE $2::int END)
     ORDER BY last_activity`,
    [empty, idle],
  );

  return {
    thresholds: { emptyMinutes: empty, idleMinutes: idle, enabled: settings.auto_close_enabled },
    sessions: rows,
  };
}

/**
 * Close everything `findStaleSessions` found.
 *
 * Each session closes in its own transaction, holding a row lock and
 * re-checking staleness inside it. Without that re-check the sweep could
 * close a table that a guest ordered at between the read and the write —
 * rare, but it is exactly the case that would be impossible to explain
 * afterwards.
 */
export async function sweepStaleSessions({ emptyMinutes, idleMinutes, force = false } = {}) {
  const settings = await getSettings();
  if (!settings.auto_close_enabled && !force) {
    return { ran: false, reason: 'auto_close_enabled is off', closed: [] };
  }

  const { thresholds, sessions } = await findStaleSessions({ emptyMinutes, idleMinutes });
  const closed = [];

  for (const candidate of sessions) {
    try {
      const result = await withTransaction(async (client) => {
        const { rows: [session] } = await client.query(
          `SELECT * FROM table_sessions WHERE id = $1 AND status <> 'CLOSED' FOR UPDATE`,
          [candidate.id],
        );
        if (!session) return null;   // someone closed or billed it first

        // Re-read activity under the lock; the candidate list is a snapshot.
        const { rows: [live] } = await client.query(
          `SELECT GREATEST($2::timestamptz, COALESCE(MAX(created_at), $2::timestamptz)) AS last_activity,
                  COUNT(*) FILTER (WHERE status <> 'CANCELLED')::int AS orders
             FROM orders WHERE session_id = $1`,
          [session.id, session.opened_at],
        );
        const minutes = (Date.now() - new Date(live.last_activity).getTime()) / 60000;
        const threshold = live.orders === 0 ? thresholds.emptyMinutes : thresholds.idleMinutes;
        if (minutes <= threshold) return null;   // it came back to life

        // Tickets still on the kitchen board were cooked; they should leave
        // the display, but cancelling them would erase food that was made.
        await client.query(
          `UPDATE orders SET status = 'SERVED', served_at = COALESCE(served_at, now())
            WHERE session_id = $1 AND status = ANY('{PLACED,ACCEPTED,PREPARING,READY}'::order_status[])`,
          [session.id],
        );

        const { rows: [updated] } = await client.query(
          `UPDATE table_sessions
              SET status = 'CLOSED', closed_at = now(), closed_by = NULL,
                  close_reason = $2, abandoned_value = $3
            WHERE id = $1 RETURNING *`,
          [session.id, candidate.reason, candidate.unbilled_value],
        );

        // Money left on a closed table is something a person has to know
        // about, so it goes to the floor as a notification rather than only
        // into a log the owner will never read.
        if (candidate.unbilled_value > 0) {
          await client.query(
            `INSERT INTO notifications (type, table_id, session_id, message)
             VALUES ('SESSION_AUTO_CLOSED', $1, $2, $3)`,
            [session.table_id, session.id,
             `${candidate.table_label} was closed automatically after ${Math.round(candidate.idle_minutes / 60)}h idle with an unbilled total.`],
          );
        }
        return { ...updated, table_label: candidate.table_label, idle_minutes: candidate.idle_minutes };
      });

      if (result) closed.push(result);
    } catch (err) {
      // One table that will not close must not stop the rest of the sweep.
      console.error(`[housekeeping] could not close session ${candidate.id}:`, err.message);
    }
  }

  for (const session of closed) {
    emitStaff('session:closed', session);
    emitTo(`session:${session.id}`, 'session:closed', session);
  }
  if (closed.length) {
    const stranded = closed.reduce((sum, s) => sum + s.abandoned_value, 0);
    console.log(`[housekeeping] closed ${closed.length} stale session(s)${stranded ? `, ${stranded / 100} unbilled` : ''}`);
  }

  return { ran: true, thresholds, closed };
}

/**
 * Run the sweep on a timer for the life of the process.
 *
 * Returns a stop function. The first run is deferred rather than fired at
 * boot: a restart during service should not be the thing that closes a
 * table, and waiting one interval costs nothing on a job that tidies up
 * after yesterday.
 */
export function startHousekeeping({ everyMinutes = 15 } = {}) {
  const period = Math.max(Number(everyMinutes) || 15, 1) * 60_000;
  const tick = async () => {
    try {
      await sweepStaleSessions();
    } catch (err) {
      console.error('[housekeeping] sweep failed:', err.message);
    }
  };
  const timer = setInterval(tick, period);
  timer.unref();   // never hold the process open just for this
  return () => clearInterval(timer);
}
