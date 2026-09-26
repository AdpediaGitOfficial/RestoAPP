-- Analytics needs to know what a "day" is, and what hour a sale happened in.
--
-- Timestamps are stored as timestamptz (correct — an instant is an instant),
-- but every report bucketed them in the server's zone, which on a cloud box
-- is UTC. For a café in India that put a 7pm dinner order in the 13:00 bucket
-- and ran the business day from 05:30 to 05:30, so "sales by hour" pointed at
-- the wrong service entirely and daily totals mixed two trading days.
--
-- The zone belongs to the restaurant, not the server, so it lives here and
-- every report reads it. Anything PostgreSQL accepts in `AT TIME ZONE` works.

ALTER TABLE restaurant_settings
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';

-- Fail loudly at migration time rather than silently bucketing into UTC if a
-- deployment ever sets a name this server's tzdata does not carry.
DO $$
BEGIN
  PERFORM now() AT TIME ZONE (SELECT timezone FROM restaurant_settings WHERE id = 1);
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'restaurant_settings.timezone is not a zone this server knows';
END $$;

-- Reports scan bills by settlement time and order_items by order time; both
-- grew an index here because the dashboard now asks for arbitrary windows
-- rather than a single day.
CREATE INDEX IF NOT EXISTS bills_settled_at_idx
  ON bills (settled_at) WHERE status = 'SETTLED';

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at);

CREATE INDEX IF NOT EXISTS table_sessions_opened_at_idx ON table_sessions (opened_at);
