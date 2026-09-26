#!/usr/bin/env node
/**
 * Prove the stale-session sweep closes what it should and, far more
 * importantly, leaves alone what it should not.
 *
 * The dangerous failure is not "a table stayed open too long" — it is a
 * session closed under a party that is still eating, who then cannot order
 * another round and get no explanation. So most of these checks are about
 * what the sweep declines to touch.
 *
 * Seeded rows are removed in a finally block. The sweep runs on its own
 * pooled connection, so the seed has to be committed rather than held in a
 * transaction the sweep cannot see.
 *
 *   node scripts/verify-housekeeping.mjs
 */
import { pool, query } from '../src/db/index.js';
import { findStaleSessions, sweepStaleSessions, REASONS } from '../src/services/housekeeping.js';

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
};

const made = [];
const tablesMade = [];
const EMPTY = 120, IDLE = 720;   // the shipped defaults, in minutes

/**
 * A session whose last activity is `agoMinutes` back.
 *
 * Each case gets its own table: a partial unique index allows only one live
 * session per table, and on a real floor every table is already taken.
 */
async function seed({ label, agoMinutes, orders = 0, status = 'OPEN', ticketsOpen = false }) {
  const tag = 'HKT' + Math.random().toString(36).slice(2, 8).toUpperCase();
  const { rows: [table] } = await query(
    `INSERT INTO dining_tables (code, label, seats, zone, qr_token, is_active, sort_order)
     VALUES ($1, $2, 2, 'Verification', $3, false, 9999) RETURNING id`,
    [tag, 'Verify ' + tag, tag + '-qr'],
  );
  tablesMade.push(table.id);
  const { rows: [item] } = await query('SELECT id, name, price FROM menu_items LIMIT 1');
  const { rows: [s] } = await query(
    `INSERT INTO table_sessions (table_id, code, status, guest_count, opened_at)
     VALUES ($1, $2, $3::session_status, 2, now() - make_interval(mins => $4::int)) RETURNING *`,
    // A session that ordered is seated before its first order; one that never
    // ordered has nothing after it, so its seating IS its last activity and
    // padding it would push the case over the line being tested.
    [table.id, 'HK' + Math.random().toString(36).slice(2, 8).toUpperCase(), status,
     agoMinutes + (orders > 0 ? 30 : 0)],
  );
  made.push(s.id);
  for (let i = 0; i < orders; i++) {
    const { rows: [o] } = await query(
      `INSERT INTO orders (session_id, table_id, order_number, status, subtotal, created_at)
       VALUES ($1, $2, nextval('order_number_seq'), $3::order_status, $4, now() - make_interval(mins => $5::int))
       RETURNING id`,
      [s.id, table.id, ticketsOpen ? 'PREPARING' : 'SERVED', item.price * 2, agoMinutes],
    );
    await query(
      `INSERT INTO order_items (order_id, menu_item_id, item_name, unit_price, quantity, line_total, status, created_at)
       VALUES ($1, $2, $3, $4, 2, $5, 'SERVED', now() - make_interval(mins => $6::int))`,
      [o.id, item.id, item.name, item.price, item.price * 2, agoMinutes],
    );
  }
  return { ...s, label };
}

try {
  const cases = {
    // Should close
    emptyOld:   await seed({ label: 'scanned, never ordered, 5h ago', agoMinutes: 300 }),
    idleOld:    await seed({ label: 'ordered, silent 20h', agoMinutes: 1200, orders: 2 }),
    idleTicket: await seed({ label: 'ordered, silent 20h, ticket still open', agoMinutes: 1200, orders: 1, ticketsOpen: true }),
    billOld:    await seed({ label: 'bill requested, silent 20h', agoMinutes: 1200, orders: 1, status: 'BILL_REQUESTED' }),
    // Should NOT close
    emptyFresh: await seed({ label: 'scanned 20 minutes ago', agoMinutes: 20 }),
    longLunch:  await seed({ label: 'seated 6h ago, ordered 40m ago', agoMinutes: 40, orders: 3 }),
    justOrdered:await seed({ label: 'ordered 5 minutes ago', agoMinutes: 5, orders: 1 }),
    emptyEdge:  await seed({ label: 'empty, just under the 2h line', agoMinutes: EMPTY - 10 }),
    idleEdge:   await seed({ label: 'ordered, just under the 12h line', agoMinutes: IDLE - 30, orders: 1 }),
  };

  // The long lunch is the case that matters: an old session with a recent
  // order. Staleness measured from opened_at would close it mid-meal.
  await query('UPDATE table_sessions SET opened_at = now() - interval \'6 hours\' WHERE id = $1', [cases.longLunch.id]);

  const { sessions: preview } = await findStaleSessions({ emptyMinutes: EMPTY, idleMinutes: IDLE });
  const flagged = new Set(preview.map((s) => s.id));

  check('an empty session past the short threshold is flagged', flagged.has(cases.emptyOld.id));
  check('an idle session past the long threshold is flagged', flagged.has(cases.idleOld.id));
  check('a bill-requested session that went silent is flagged', flagged.has(cases.billOld.id));

  check('a table seated 6h ago that ordered 40m ago is LEFT ALONE', !flagged.has(cases.longLunch.id));
  check('a table that just ordered is LEFT ALONE', !flagged.has(cases.justOrdered.id));
  check('a fresh scan is LEFT ALONE', !flagged.has(cases.emptyFresh.id));
  check('an empty session just under the line is LEFT ALONE', !flagged.has(cases.emptyEdge.id));
  check('an ordered session just under the line is LEFT ALONE', !flagged.has(cases.idleEdge.id));

  const emptyRow = preview.find((s) => s.id === cases.emptyOld.id);
  const idleRow = preview.find((s) => s.id === cases.idleOld.id);
  check('an empty session is classified as empty, not idle', emptyRow?.reason === REASONS.EMPTY, emptyRow?.reason);
  check('an ordered session is classified as idle', idleRow?.reason === REASONS.IDLE, idleRow?.reason);
  check('the preview reports the money left on the table', idleRow?.unbilled_value > 0, `${idleRow?.unbilled_value}`);
  check('an empty session strands nothing', emptyRow?.unbilled_value === 0);

  // ---- and now actually run it -------------------------------------------
  const { closed } = await sweepStaleSessions({ emptyMinutes: EMPTY, idleMinutes: IDLE });
  const closedIds = new Set(closed.map((s) => s.id));

  check('the sweep closed the abandoned tables', closedIds.has(cases.emptyOld.id) && closedIds.has(cases.idleOld.id));
  check('the sweep did not touch the long lunch', !closedIds.has(cases.longLunch.id));

  const { rows: after } = await query(
    `SELECT id, status, close_reason, abandoned_value, closed_by FROM table_sessions WHERE id = ANY($1)`,
    [Object.values(cases).map((c) => c.id)]);
  const by = Object.fromEntries(after.map((r) => [r.id, r]));

  check('a closed session records why it closed', by[cases.idleOld.id].close_reason === REASONS.IDLE);
  check('a closed session records what was unbilled', by[cases.idleOld.id].abandoned_value > 0,
    `${by[cases.idleOld.id].abandoned_value}`);
  check('an auto-close names no person as having done it', by[cases.idleOld.id].closed_by === null);
  check('the long lunch is still open', by[cases.longLunch.id].status !== 'CLOSED');
  check('the just-ordered table is still open', by[cases.justOrdered.id].status !== 'CLOSED');

  // Tickets must leave the kitchen board, but the food must not be erased.
  const { rows: [tickets] } = await query(
    `SELECT COUNT(*) FILTER (WHERE status = ANY('{PLACED,ACCEPTED,PREPARING,READY}'::order_status[]))::int AS still_open,
            COUNT(*) FILTER (WHERE status = 'CANCELLED')::int AS cancelled,
            COUNT(*) FILTER (WHERE status = 'SERVED')::int AS served
       FROM orders WHERE session_id = $1`, [cases.idleTicket.id]);
  check('an open ticket leaves the kitchen board', tickets.still_open === 0);
  check('the food is marked served, never cancelled', tickets.served === 1 && tickets.cancelled === 0);

  // Money left behind has to reach a person.
  const { rows: [note] } = await query(
    `SELECT COUNT(*)::int AS n FROM notifications
      WHERE session_id = $1 AND type = 'SESSION_AUTO_CLOSED'`, [cases.idleOld.id]);
  check('unbilled value raises a notification for the floor', note.n === 1);

  const { rows: [quiet] } = await query(
    `SELECT COUNT(*)::int AS n FROM notifications WHERE session_id = $1`, [cases.emptyOld.id]);
  check('an empty table closes quietly, with no notification', quiet.n === 0);

  // Running it twice must be a no-op, not an error.
  const second = await sweepStaleSessions({ emptyMinutes: EMPTY, idleMinutes: IDLE });
  check('a second sweep closes nothing already closed',
    !second.closed.some((s) => closedIds.has(s.id)));

  // The switch has to actually switch it off.
  await query('UPDATE restaurant_settings SET auto_close_enabled = false WHERE id = 1');
  const off = await sweepStaleSessions({});
  check('the sweep does nothing when it is turned off', off.ran === false && off.closed.length === 0);
  const forced = await sweepStaleSessions({ emptyMinutes: EMPTY, idleMinutes: IDLE, force: true });
  check('an admin can still run it by hand while it is off', forced.ran === true);
  await query('UPDATE restaurant_settings SET auto_close_enabled = true WHERE id = 1');
} catch (err) {
  console.error('\nverification aborted:', err.message);
  failures++;
} finally {
  await query('UPDATE restaurant_settings SET auto_close_enabled = true WHERE id = 1').catch(() => {});
  if (made.length) {
    // Sessions first: dining_tables is ON DELETE RESTRICT from here.
    await query('DELETE FROM table_sessions WHERE id = ANY($1)', [made]).catch(() => {});
  }
  if (tablesMade.length) {
    await query('DELETE FROM dining_tables WHERE id = ANY($1)', [tablesMade]).catch((e) =>
      console.error('(could not remove verification tables:', e.message + ')'));
    console.log('\n(seeded sessions and their tables removed)');
  }
  await pool.end();
}

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
