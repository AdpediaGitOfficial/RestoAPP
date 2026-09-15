-- =====================================================================
-- RestoAPP :: initial schema
-- Money is always stored in integer MINOR units (e.g. paise / cents)
-- to keep arithmetic exact. The `currency` setting decides how it reads.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- misc
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------ settings
-- Single-row table holding restaurant wide configuration.
CREATE TABLE restaurant_settings (
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name                text    NOT NULL DEFAULT 'My Cafe',
  address             text    NOT NULL DEFAULT '',
  phone               text    NOT NULL DEFAULT '',
  currency            text    NOT NULL DEFAULT 'INR',
  currency_symbol     text    NOT NULL DEFAULT '₹',
  tax_label           text    NOT NULL DEFAULT 'GST',
  tax_percent         numeric(5,2) NOT NULL DEFAULT 5.00 CHECK (tax_percent >= 0),
  service_charge_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (service_charge_percent >= 0),
  tax_inclusive       boolean NOT NULL DEFAULT false,
  round_bill_total    boolean NOT NULL DEFAULT true,
  accept_orders       boolean NOT NULL DEFAULT true,
  bill_footer_note    text    NOT NULL DEFAULT 'Thank you, visit again!',
  updated_at          timestamptz NOT NULL DEFAULT now()
);
INSERT INTO restaurant_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- --------------------------------------------------------------- users
CREATE TYPE user_role AS ENUM ('ADMIN', 'SUPERVISOR', 'KITCHEN');

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         citext,
  password_hash text NOT NULL,
  role          user_role NOT NULL DEFAULT 'SUPERVISOR',
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));
CREATE TRIGGER users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------- tables
CREATE TABLE dining_tables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,              -- "T1", "T2", "PATIO-3"
  label       text NOT NULL,                     -- "Table 1"
  seats       int  NOT NULL DEFAULT 4 CHECK (seats > 0),
  zone        text NOT NULL DEFAULT 'Main',      -- floor / section
  qr_token    text NOT NULL UNIQUE,              -- secret slug embedded in the QR
  is_active   boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER dining_tables_updated BEFORE UPDATE ON dining_tables
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------- menu
CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_key ON categories (lower(name));
CREATE TRIGGER categories_updated BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE food_type AS ENUM ('VEG', 'NON_VEG', 'EGG', 'VEGAN');

CREATE TABLE menu_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name          text NOT NULL,
  description   text NOT NULL DEFAULT '',
  price         int  NOT NULL CHECK (price >= 0),        -- minor units
  image_url     text,
  food_type     food_type NOT NULL DEFAULT 'VEG',
  is_available  boolean NOT NULL DEFAULT true,           -- in stock today
  is_active     boolean NOT NULL DEFAULT true,           -- on the menu at all
  is_recommended boolean NOT NULL DEFAULT false,
  spice_level   int NOT NULL DEFAULT 0 CHECK (spice_level BETWEEN 0 AND 3),
  prep_minutes  int NOT NULL DEFAULT 10 CHECK (prep_minutes >= 0),
  kitchen_station text NOT NULL DEFAULT 'KITCHEN',       -- KITCHEN | BAR | BAKERY ...
  tags          text[] NOT NULL DEFAULT '{}',
  sort_order    int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_category_idx ON menu_items (category_id);
CREATE TRIGGER menu_items_updated BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Size / portion variants: "Regular", "Large". Optional per item.
CREATE TABLE menu_item_variants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name         text NOT NULL,
  price_delta  int  NOT NULL DEFAULT 0,      -- added to the item price
  is_default   boolean NOT NULL DEFAULT false,
  sort_order   int NOT NULL DEFAULT 0
);
CREATE INDEX menu_item_variants_item_idx ON menu_item_variants (menu_item_id);

-- Paid or free add-ons: "Extra cheese", "Oat milk".
CREATE TABLE menu_item_addons (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  name         text NOT NULL,
  price        int  NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0
);
CREATE INDEX menu_item_addons_item_idx ON menu_item_addons (menu_item_id);

-- ------------------------------------------------------- table sessions
-- A "session" is one seating of a table: opened on the first order,
-- closed when the bill is settled. All orders and the bill hang off it.
CREATE TYPE session_status AS ENUM ('OPEN', 'BILL_REQUESTED', 'BILLED', 'CLOSED');

CREATE TABLE table_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      uuid NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
  code          text NOT NULL UNIQUE,            -- short code shown to the guest
  status        session_status NOT NULL DEFAULT 'OPEN',
  guest_count   int NOT NULL DEFAULT 1 CHECK (guest_count > 0),
  guest_name    text,
  guest_phone   text,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  bill_requested_at timestamptz,
  payment_preference text,                       -- what the guest asked for
  closed_at     timestamptz,
  opened_by     uuid REFERENCES users(id),       -- null => opened by the guest
  closed_by     uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- At most one live session per table.
CREATE UNIQUE INDEX table_sessions_one_live_per_table
  ON table_sessions (table_id) WHERE status <> 'CLOSED';
CREATE INDEX table_sessions_status_idx ON table_sessions (status);
CREATE TRIGGER table_sessions_updated BEFORE UPDATE ON table_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------- orders
CREATE TYPE order_status AS ENUM ('PLACED','ACCEPTED','PREPARING','READY','SERVED','CANCELLED');
CREATE TYPE order_channel AS ENUM ('QR','STAFF');

CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  table_id      uuid NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
  order_number  bigint NOT NULL DEFAULT nextval('order_number_seq') UNIQUE,
  status        order_status NOT NULL DEFAULT 'PLACED',
  channel       order_channel NOT NULL DEFAULT 'QR',
  note          text NOT NULL DEFAULT '',
  subtotal      int NOT NULL DEFAULT 0,          -- sum of line totals, minor units
  placed_by     uuid REFERENCES users(id),       -- null => placed by the guest
  guest_device  text,                            -- anonymous device id of the guest
  accepted_at   timestamptz,
  ready_at      timestamptz,
  served_at     timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_session_idx ON orders (session_id);
CREATE INDEX orders_status_idx  ON orders (status);
CREATE INDEX orders_created_idx ON orders (created_at DESC);
CREATE TRIGGER orders_updated BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE order_item_status AS ENUM ('PENDING','PREPARING','READY','SERVED','CANCELLED');

CREATE TABLE order_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id  uuid REFERENCES menu_items(id) ON DELETE SET NULL,
  variant_id    uuid REFERENCES menu_item_variants(id) ON DELETE SET NULL,
  -- Snapshots: the bill must never change if the menu is edited later.
  item_name     text NOT NULL,
  variant_name  text,
  unit_price    int  NOT NULL CHECK (unit_price >= 0),
  quantity      int  NOT NULL CHECK (quantity > 0),
  addons        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{id,name,price}]
  addons_total  int  NOT NULL DEFAULT 0,              -- per single unit
  line_total    int  NOT NULL,                        -- (unit+addons) * qty
  note          text NOT NULL DEFAULT '',
  status        order_item_status NOT NULL DEFAULT 'PENDING',
  kitchen_station text NOT NULL DEFAULT 'KITCHEN',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE TRIGGER order_items_updated BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------- bills
CREATE TYPE bill_status AS ENUM ('DRAFT','SETTLED','VOID');
CREATE TYPE payment_method AS ENUM ('CASH','CARD','UPI','WALLET','OTHER');

CREATE SEQUENCE bill_number_seq START 1;

CREATE TABLE bills (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  table_id       uuid NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
  bill_number    text NOT NULL UNIQUE,
  status         bill_status NOT NULL DEFAULT 'DRAFT',
  subtotal       int NOT NULL DEFAULT 0,
  discount_amount int NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  discount_reason text NOT NULL DEFAULT '',
  tax_percent    numeric(5,2) NOT NULL DEFAULT 0,
  tax_amount     int NOT NULL DEFAULT 0,
  service_charge_percent numeric(5,2) NOT NULL DEFAULT 0,
  service_charge_amount  int NOT NULL DEFAULT 0,
  rounding_adjustment int NOT NULL DEFAULT 0,
  total          int NOT NULL DEFAULT 0,
  amount_paid    int NOT NULL DEFAULT 0,
  payment_method payment_method,
  payment_reference text,
  created_by     uuid REFERENCES users(id),
  settled_by     uuid REFERENCES users(id),
  settled_at     timestamptz,
  voided_by      uuid REFERENCES users(id),
  voided_at      timestamptz,
  void_reason    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- Only one bill that still counts per session (drafts + settled).
CREATE UNIQUE INDEX bills_one_active_per_session
  ON bills (session_id) WHERE status <> 'VOID';
CREATE INDEX bills_settled_at_idx ON bills (settled_at DESC);
CREATE TRIGGER bills_updated BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------- print jobs
CREATE TYPE print_job_type   AS ENUM ('KOT','BILL','KOT_VOID');
CREATE TYPE print_job_status AS ENUM ('QUEUED','PRINTED','FAILED');

CREATE TABLE print_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        print_job_type NOT NULL,
  station     text NOT NULL DEFAULT 'KITCHEN',
  order_id    uuid REFERENCES orders(id) ON DELETE CASCADE,
  bill_id     uuid REFERENCES bills(id) ON DELETE CASCADE,
  copy_number int NOT NULL DEFAULT 1,
  content     text NOT NULL,                 -- plain-text ticket, ready to print
  status      print_job_status NOT NULL DEFAULT 'QUEUED',
  error       text,
  printed_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX print_jobs_status_idx ON print_jobs (status, created_at);
CREATE INDEX print_jobs_order_idx  ON print_jobs (order_id);

-- ------------------------------------------------------------- notices
-- Staff-facing notifications: bill requests, waiter calls, new orders.
CREATE TYPE notification_type AS ENUM ('BILL_REQUEST','NEW_ORDER','WAITER_CALL','ORDER_CANCELLED');

CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         notification_type NOT NULL,
  table_id     uuid REFERENCES dining_tables(id) ON DELETE CASCADE,
  session_id   uuid REFERENCES table_sessions(id) ON DELETE CASCADE,
  order_id     uuid REFERENCES orders(id) ON DELETE CASCADE,
  message      text NOT NULL,
  is_read      boolean NOT NULL DEFAULT false,
  read_by      uuid REFERENCES users(id),
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_unread_idx ON notifications (is_read, created_at DESC);
