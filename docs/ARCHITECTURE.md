# Architecture

How RestoAPP is put together, and why.

## The shape of the system

```
   Guest phone              Kitchen screen          Supervisor / Admin
   (QR, no login)           (KDS)                   (JWT session)
        │                        │                          │
        └────────────┬───────────┴──────────────┬───────────┘
                     │  REST over HTTPS         │  Socket.IO
                     ▼                          ▼
            ┌──────────────────────────────────────────┐
            │  Express API                             │
            │  routes → services → db                  │
            │  ├── public   guest ordering             │
            │  ├── staff    kitchen + floor + billing  │
            │  └── admin    menu, tables, metrics      │
            └────────────────┬─────────────────────────┘
                             ▼
                      PostgreSQL          →  ESC/POS printer (optional)
```

## Core idea: the table session

A **table session** is one seating of a table — from the first order to the
settled bill. Orders and the bill hang off the session, not the table, so a table
can be used many times a day and each guest's history stays separate.

```
dining_table ──< table_session ──< order ──< order_item
                      │
                      └──── bill
```

A partial unique index enforces the rule that matters:

```sql
CREATE UNIQUE INDEX table_sessions_one_live_per_table
  ON table_sessions (table_id) WHERE status <> 'CLOSED';
```

One live session per table, guaranteed by the database rather than by application
code that can race. Sessions open lazily: nobody marks a table occupied, the first
order does it.

## Money

**Every amount is an integer count of minor units** (paise, cents) from the
database through to the API. Floating point never touches a total. The conversion
to `₹278.50` happens once, at the display edge.

All the bill arithmetic lives in one pure function, `computeTotals()`, which
handles discount, service charge, inclusive or exclusive tax, and rounding. It is
the only place these rules exist, and it is directly unit tested.

```
subtotal − discount = taxable
  + service charge  (% of taxable)
  + tax             (% of taxable + service charge, or extracted if inclusive)
  ± rounding        (to the nearest whole major unit)
  = total
```

## The ordering flow

```
guest taps "Send to kitchen"
   │
   ▼  POST /api/public/orders  { qr token, item ids, quantities }
┌──────────────────────── one transaction ────────────────────────┐
│  lock the table                                                 │
│  find or open the session                                       │
│  re-price the cart against the live menu   ← the client never   │
│  insert the order and its lines              sets a price       │
│  raise a staff notification                                     │
└─────────────────────────────────────────────────────────────────┘
   │
   ├─ render one kitchen ticket per station, store it, print it
   └─ broadcast order:created to the kitchen, the floor and the guest
```

Two things are deliberate here:

**The server prices everything.** The client sends item ids and quantities. Prices,
variants and add-ons are resolved server-side against the current menu, so a
tampered request cannot buy a coffee for ₹1. Items that went out of stock between
browsing and ordering are rejected with a message the guest can act on.

**Line items are snapshots.** `order_items` stores the item name, price, variant
name and add-ons as they were at the moment of ordering. Editing the menu — or
deleting an item — can never change a bill that has already been raised.

## Billing

Billing is a two-step flow, because taking money is not something to do by
accident:

1. **Generate** — creates or refreshes a `DRAFT` bill. Running it again re-prices,
   so an order placed while the guest was asking for the bill is still captured.
   The supervisor sees the amount before anything is collected.
2. **Settle** — records the payment method, closes the session, marks any
   outstanding orders served, and prints the receipt. A settled bill is immutable.

A draft can be voided (the table stays open); a settled bill cannot.

## Realtime

Socket.IO with four room types:

| Room | Who is in it | What they get |
|---|---|---|
| `staff` | every signed-in staff member | new orders, bill requests, waiter calls |
| `kitchen` | kitchen displays | order created and status changes |
| `session:<id>` | the guests at one table | their own order status, their bill |
| `table:<id>` | anyone watching one table | the same, scoped to the table |

Guests only ever join their own session room, so one table cannot watch another.
Every screen also polls on a slow interval as a safety net, so a dropped socket
degrades to "slightly stale" rather than "broken".

## Printing

Tickets are rendered as plain text sized to the paper width, then:

- **stored** as a `print_job` — this is what makes reprints and browser printing work
- **streamed** to a network printer as ESC/POS bytes, when one is configured

The kitchen ticket deliberately carries no prices — the kitchen needs the table,
the items, the options and the notes. The bill carries the full breakdown.

Orders are split by `kitchen_station`, so a table ordering a latte and a croissant
produces one ticket at the bar and one at the bakery.

## Security

| Concern | How it is handled |
|---|---|
| Table identity | A random 96-bit token in the QR, rotatable if a printed code leaks |
| Guest access | A session can only be read through the QR token of its own table |
| Pricing | Re-priced server-side on every order; the client cannot set prices |
| Staff auth | bcrypt passwords, JWT in an httpOnly cookie (bearer also accepted) |
| Roles | `ADMIN` ⊇ `SUPERVISOR` ⊇ `KITCHEN`, enforced per route |
| Input | Every request body is validated with zod before it reaches a service |
| SQL | Parameterised queries throughout |
| CORS | An explicit origin allowlist |

Guests are anonymous by design — there is no account to breach, and the only thing
a QR token grants is the ability to order to that table.

## Decisions worth knowing

**Raw SQL over an ORM.** The schema is not large, and the queries that matter —
the floor board, the daily metrics — are aggregate queries that read better as
SQL than as ORM chains. The trade-off is that there is no generated type layer;
the service functions are the contract.

**Migrations are forward-only.** A tiny runner applies each `.sql` file once and
records it. Enough for a project this size, with no framework to learn.

**Charts are hand-rolled.** Four small widgets did not justify a charting library
in the admin bundle.

**Deletes archive rather than destroy.** Removing a menu item that appears on a
past bill retires it instead. History stays intact.

## Where to extend it

- **Payment gateway** — `settleBill()` records the method and a reference; a
  Razorpay or Stripe call slots in ahead of it
- **Multi-outlet** — add a `restaurant_id` to the tables, menu and settings; the
  session model already scopes everything else
- **Guest accounts** — `table_sessions` already has `guest_name`/`guest_phone`
- **Inventory** — decrement stock from `order_items` and auto-flip `is_available`
- **Reservations** — sessions can be opened ahead of time by staff
