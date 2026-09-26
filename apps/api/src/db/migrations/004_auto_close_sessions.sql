-- Tables that were never closed stay "occupied" forever.
--
-- A guest scans, the table is seated, service happens, and at some point
-- nobody presses the button. The session stays OPEN: the floor board shows a
-- table that is actually empty, its orders sit on the kitchen display, and
-- occupancy reads 100% because as far as the data knows those guests never
-- left. On this database eight tables had been open for ten days.
--
-- So sessions get swept shut on a schedule. Two things make that safe rather
-- than destructive:
--
--   * A session is only stale if nothing has happened on it for a while —
--     measured from its last order, not from when it opened. A long lunch is
--     not an abandoned table.
--
--   * Closing one can strand money. Every one of those eight tables had
--     unbilled orders, ₹26,350 between them. The sweep records what it closed
--     and what was on the table when it did, so the value is auditable
--     afterwards instead of disappearing.

-- Money left on an auto-closed table is something a person has to be told
-- about, so the sweep raises a notification and needs a type for it. Adding a
-- value here is safe inside the migration's transaction because nothing uses
-- it until after that transaction commits.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'SESSION_AUTO_CLOSED';

ALTER TABLE table_sessions
  -- NULL for a session a person closed. Set when the sweep did it.
  ADD COLUMN IF NOT EXISTS close_reason text,
  -- What was unbilled at the moment of closing, in minor units. Kept on the
  -- row because the orders stay where they are and this is the only record
  -- that the money was never collected.
  ADD COLUMN IF NOT EXISTS abandoned_value int NOT NULL DEFAULT 0;

ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS auto_close_enabled boolean NOT NULL DEFAULT true,
  -- A table that ordered nothing is someone who scanned the QR and left, or a
  -- code printed and tested. Two hours is already generous for that.
  ADD COLUMN IF NOT EXISTS auto_close_empty_minutes int NOT NULL DEFAULT 120
    CHECK (auto_close_empty_minutes >= 15),
  -- A table that ordered needs far longer, because the cost of closing one
  -- early is a guest who cannot order their next round. Twelve hours clears
  -- last night's service without ever touching today's.
  ADD COLUMN IF NOT EXISTS auto_close_idle_minutes int NOT NULL DEFAULT 720
    CHECK (auto_close_idle_minutes >= 60);

-- The sweep looks for live sessions and their last order every few minutes.
CREATE INDEX IF NOT EXISTS table_sessions_live_idx
  ON table_sessions (opened_at) WHERE status <> 'CLOSED';

CREATE INDEX IF NOT EXISTS orders_session_created_idx ON orders (session_id, created_at DESC);
