# RestoAPP — QR table ordering for cafes

Guests scan the QR code on their table, browse the menu and order. Orders print in
the kitchen. Supervisors watch every table's running bill and settle payments.
Admins manage the menu, the tables and the day's numbers.

Built with **Next.js** (App Router), **Node.js/Express** and **PostgreSQL**.

---

## What it does

### Guests — no app, no login
Scan → menu → order → pay. The QR code carries a secret token that identifies the
table; there is nothing to install and nothing to sign into.

- Browse by category with search, veg/non-veg marks and prep times
- Pick sizes and add-ons, leave a note for the kitchen ("less spicy")
- Order in rounds — everything lands on one bill
- Watch each order move from *sent* to *preparing* to *ready*
- See the running total with the tax breakdown before asking to pay
- Request the bill (with a payment preference) or call a member of staff

### Kitchen
- Live four-column board: new → accepted → preparing → ready
- One ticket per station, so the bar, bakery and kitchen each get their own
- Tickets turn amber after 10 minutes and red after 20 — nothing gets lost
- Reprint any ticket; cancelling an order prints a void slip

### Supervisors
- Every table at a glance: status, time seated, orders cooking, amount due
- Bill requests pulse on the floor view the moment a guest taps the button
- Table detail: full order history, add a discount, take payment by
  cash / card / UPI / wallet, settle — which closes the table and prints the receipt
- Bills register with date filters and totals for the period

### Admins
- **Daily metrics**: revenue, covers, average bill, hourly split, best sellers,
  category mix, payment mix, takings per staff member and a 14-day trend
- **Menu**: categories, items, sizes, add-ons, kitchen station, one-tap "sold out"
- **Tables**: create a run of tables at once, print QR table tents, rotate a
  compromised code
- **Staff**: accounts and roles
- **Settings**: tax (inclusive or exclusive), service charge, rounding, and a
  switch to stop taking QR orders at closing time

---

## Getting started

### 1. Requirements

- Node.js 20+
- PostgreSQL 14+

### 2. Install and configure

```bash
git clone <this repo> && cd RestoAPP
npm install
cp .env.example apps/api/.env
```

Edit `apps/api/.env` — at minimum `DATABASE_URL` and a real `JWT_SECRET`:

```bash
DATABASE_URL=postgresql://resto:resto@127.0.0.1:5432/restoapp
JWT_SECRET=$(openssl rand -hex 32)
```

Create the database if you need to:

```bash
createdb restoapp
```

### 3. Migrate and seed

```bash
npm run db:migrate     # create the schema
npm run db:seed        # demo cafe: 8 tables, a full menu, three logins
```

The seed prints a scannable link for every table.

### 4. Run

```bash
npm run dev            # API on :4000, web on :3000
```

| Screen | URL | Login |
|---|---|---|
| Guest menu | `/t/<table-token>` | none — scan the QR |
| Staff sign in | `/login` | |
| Kitchen | `/kitchen` | `kitchen@restoapp.local` / `kitchen123` |
| Floor | `/supervisor` | `supervisor@restoapp.local` / `supervisor123` |
| Admin | `/admin` | `admin@restoapp.local` / `admin12345` |

**Change these passwords before going anywhere near production.**

### With Docker

```bash
docker compose up --build
```

Brings up PostgreSQL, the API and the web app, and runs the migrations.

---

## Kitchen printing

Two ways to get a ticket onto paper — pick whichever suits the hardware.

**Browser printing (no setup).** Every ticket is stored as a print job. Tick
*Auto-print tickets* on the kitchen screen and each new ticket opens the browser's
print dialog. Any printer the machine can see will work.

**Network thermal printer (unattended).** Point the API at an ESC/POS printer and
tickets are pushed straight to it as they are created:

```bash
PRINTER_DRIVER=escpos
PRINTER_HOST=192.168.1.50
PRINTER_PORT=9100
PRINTER_CHARS_PER_LINE=42   # 42 for 80mm, 32 for 58mm
```

Failed prints are recorded with the error and can be reprinted from the kitchen or
floor screens.

---

## How it fits together

```
apps/
├── api/                    Express + Socket.IO + PostgreSQL
│   └── src/
│       ├── db/             pool, migration runner, SQL migrations, seed
│       ├── lib/            auth, errors, validation, money
│       ├── services/       orders, billing, sessions, printing, metrics
│       ├── routes/         auth · public (guest) · staff · admin
│       └── realtime/       websocket rooms
└── web/                    Next.js App Router
    └── src/
        ├── app/            /t/[token] · /kitchen · /supervisor · /admin · /print
        ├── components/     guest screens, staff shell, charts, shared UI
        └── lib/            API client, cart, realtime hook, formatting
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, the ordering
and billing flows, and the decisions behind them.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API and web together, both watching |
| `npm run build` | Production build of the web app |
| `npm run db:migrate` | Apply any new migrations |
| `npm run db:seed` | Load the demo cafe |
| `npm run db:reset` | Drop everything, migrate, reseed |
| `npm test` | API unit tests |

---

## Going live — the short checklist

1. Set a strong `JWT_SECRET` and change every seeded password
2. Set `PUBLIC_WEB_URL` to your real domain **before** printing QR codes —
   the codes embed this URL
3. Set `CORS_ORIGINS` to your web origin only
4. Serve both apps over HTTPS (auth cookies are marked `secure` in production)
5. Back the database up — it holds every bill you have raised
