# Deploying RestoAPP

Notes for a single-server deployment behind nginx and Cloudflare, which is
how most small restaurants will run this.

---

## Pointing the web app at the API

Set `API_URL` in the web app's environment and restart. **No rebuild needed.**

```bash
cd apps/web
API_URL=https://api.your-domain.com pm2 restart resto-web --update-env
```

The browser fetches this per request from `/env.js`, so the running
process's value always wins:

```bash
curl -s https://resto.your-domain.com/env.js
# window.__RESTO_API_URL__="https://api.your-domain.com";
```

If that prints the wrong URL, the environment variable did not reach the
process — check `pm2 env <id>` and remember `--update-env`.

### Why this exists

`NEXT_PUBLIC_*` values are compiled into the bundle by `next build`, so
setting `NEXT_PUBLIC_API_URL` after building does nothing: the browser keeps
calling whatever URL was present at build time, usually `http://localhost:4000`.
That fails on a real domain and is blocked as mixed content on HTTPS, with no
useful error. `API_URL` at runtime avoids the whole trap.

`NEXT_PUBLIC_API_URL` still works as a build-time default, and a production
build warns when it is missing or points at localhost. To see what a bundle
baked in:

```bash
grep -rho 'https\?://[^"]*' apps/web/.next/static/chunks/*.js | sort -u | head
```

---

## There is no `/v1` prefix

Paths are exactly as written — `GET /health`, `POST /api/auth/login`. Calling
`/api/v1/anything` returns 404 because that route does not exist.

`GET /` on the API returns the full route map, so when in doubt:

```bash
curl -s https://api.your-domain.com/ | jq
```

| What | Path |
|---|---|
| Health check | `GET /health` |
| Route map | `GET /` |
| Staff login | `POST /api/auth/login` |
| Guest menu | `GET /api/public/menu` |
| Guest table | `GET /api/public/tables/:qrToken` |
| Floor board | `GET /api/staff/tables` |
| Daily metrics | `GET /api/admin/metrics/daily` |

---

## Check the deployment

```bash
npm run doctor                                   # config + database
npm run doctor -- https://api.your-domain.com    # also probe the live API
```

It verifies the database is reachable, migrations are applied, an active
admin account exists, tables and menu items exist, and that CORS accepts
each configured origin. It exits non-zero on failure, so CI can use it.

The API also prints its effective settings on boot, and warns about the
things that silently break login and QR codes:

```
[api] listening on http://localhost:4000 (production)
[api] cors origins   : https://resto.your-domain.com
[api] public web url : https://resto.your-domain.com
[api] auth cookie    : SameSite=lax; Secure=true
```

---

## Environment

### API (`apps/api/.env`)

```bash
NODE_ENV=production
API_PORT=4000
DATABASE_URL=postgresql://resto:STRONG_PASSWORD@127.0.0.1:5432/restoapp

# Must be a long random value. Anyone who knows it can mint an admin token.
JWT_SECRET=<openssl rand -hex 32>

# The web app's origin(s). The browser sends this as `Origin`; if it is not
# listed here every request from the app is rejected with 403.
CORS_ORIGINS=https://resto.your-domain.com

# QR codes embed this URL. Set it correctly BEFORE printing any codes.
PUBLIC_WEB_URL=https://resto.your-domain.com

PRINTER_DRIVER=none

# Where menu photos are written. Put this OUTSIDE the working tree so a
# deploy, a rebuild or a stray `git clean` cannot wipe the restaurant's
# photos — and include it in your backups.
UPLOAD_DIR=/var/lib/restoapp/uploads
UPLOAD_MAX_BYTES=8388608
```

### Web (`apps/web` process environment)

```bash
# Read at runtime and served to the browser via /env.js
API_URL=https://api.your-domain.com

# Used only for server-side rendering. Keeping this on loopback means the
# first paint does not pay for DNS, TLS and a Cloudflare hop out to the
# public API and back — it is the single biggest win for scan-to-menu time.
INTERNAL_API_URL=http://127.0.0.1:4000
```

### Cookies across domains

The auth cookie defaults to `SameSite=lax`, which is correct when the app and
API share a registrable domain (`resto.example.com` + `api.example.com` are
the same site). Only if they are on genuinely different domains:

```bash
COOKIE_SAMESITE=none      # requires HTTPS
COOKIE_DOMAIN=.example.com
```

The web client also sends a bearer token from `localStorage`, so sign-in works
either way — but the cookie is the more robust path.

---

## Menu photos

Photos are uploaded through **Admin → Menu → edit an item → Photo**, straight
from the phone or laptop doing the editing. The API re-encodes every upload:

- Two WebP renditions are written — 1000px for the item sheet, 400px for the
  grid — so a 4MB phone photo lands as roughly 80KB and the menu stays fast.
- EXIF is stripped. Phone photos carry GPS coordinates, and those would
  otherwise be served to every guest who opens the menu.
- The stored bytes come out of our own encoder, so a file that merely claims
  to be an image, or a real image with something appended to it, cannot
  survive the round trip.

Only admins can upload. Files are named randomly, never from the uploaded
filename.

**Set `UPLOAD_DIR` to a path outside the repository** and back it up — these
files are not in git and not in the database.

```bash
sudo mkdir -p /var/lib/restoapp/uploads
sudo chown -R "$(whoami)" /var/lib/restoapp/uploads
```

Serving them through Node works, but nginx does it better — add this to the
API server block, above `location /`:

```nginx
location /uploads/ {
    alias /var/lib/restoapp/uploads/;
    access_log off;
    expires 365d;
    add_header Cache-Control "public, immutable";
    add_header Cross-Origin-Resource-Policy "cross-origin";
    try_files $uri =404;
}
```

Filenames are random and content never changes, so caching them permanently
is safe: replacing a photo produces a new filename.

## nginx

Keep the API on its own subdomain. Both blocks need the websocket upgrade
headers, or realtime updates fall back to slow polling.

```nginx
# --- API -------------------------------------------------------------
server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    # ssl_certificate ... (certbot or Cloudflare origin cert)

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        # Required for Socket.IO
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 300s;
    }
}

# --- Web -------------------------------------------------------------
server {
    listen 443 ssl http2;
    server_name resto.your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## Cloudflare

- Enable **WebSockets** (Network settings) or realtime will not connect.
- SSL mode **Full (strict)** with an origin certificate.
- Leave **Brotli** on.
- Do not add a cache rule for `/api/*` — the API sets its own headers. Only
  `/api/public/menu` is marked cacheable (15s, plus 45s stale-while-revalidate);
  everything else is per-guest or per-session and is sent uncached. Marking an
  item sold out bypasses that cache, so guests never order something that has
  just run out.

## Performance notes

Scan-to-menu was measured on a throttled mid-range phone (1.6 Mbps, 4× CPU)
against a 205-item menu:

| | Before | After |
|---|---|---|
| Menu payload over the wire | 133 KB | 25 KB |
| Menu fetch | 768 ms | not fetched (server-rendered) |
| Time until a menu item is visible | 1776 ms | 762 ms |

What changed, in order of impact:

1. **The page is server-rendered.** The table and menu are fetched during SSR
   and handed to the client, so nothing waits for JavaScript to download and
   hydrate before the first request can even start.
2. **gzip on the API.** A big menu compresses about 5:1.
3. **Only the first sections render up front**; the rest come in on idle from
   the same payload, so a long menu does not delay first paint.
4. **Offscreen sections skip layout and paint** (`content-visibility`).
5. **Search is debounced**, so typing does not re-filter the whole menu on
   every keystroke.

If the menu still feels slow on your hardware, check in this order: is
`INTERNAL_API_URL` set (otherwise SSR goes out through Cloudflare), is nginx
gzipping the Next response, and does `curl -I` on the API show
`content-encoding: gzip`.

---

## pm2

```bash
# API
cd apps/api && pm2 start npm --name resto-api -- start

# Web — API_URL is read at runtime, so it can change without a rebuild
cd apps/web && npm run build
API_URL=https://api.your-domain.com pm2 start npm --name resto-web -- start

pm2 save && pm2 startup
```

Deploying a new version:

```bash
git pull
npm install
npm run db:migrate
cd apps/web && npm run build && cd ../..
pm2 restart resto-api resto-web --update-env
npm run doctor -- https://api.your-domain.com
```

---

## When sign-in fails

Work through it in this order.

**1. Is the API reachable and healthy?**
```bash
curl -s https://api.your-domain.com/health
```
Expect `{"status":"ok","db":"up",...}`. `"db":"down"` means `DATABASE_URL` is
wrong or PostgreSQL is not running.

**2. Do any accounts exist?**
```bash
npm run doctor
```
"no staff accounts exist" means the seed never ran: `npm run db:seed`.

**3. Does login work without a browser?**
```bash
curl -s -X POST https://api.your-domain.com/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@restoapp.local","password":"admin12345"}'
```
- A token comes back → the API is fine, the problem is in the browser (go to 4).
- `401 Incorrect email or password` → wrong credentials, or the account is
  disabled. Reset it:
  ```bash
  psql "$DATABASE_URL" -c "SELECT email, role, is_active FROM users;"
  ```

**4. Open the browser devtools on the login page and watch the Network tab.**

| What you see | Cause | Fix |
|---|---|---|
| Request goes to `localhost:4000` | `API_URL` not reaching the process | `pm2 restart resto-web --update-env`, then check `/env.js` |
| `CORS_ORIGIN_NOT_ALLOWED` | Web origin missing from the allowlist | Add it to `CORS_ORIGINS`, restart the API |
| Blocked as mixed content | API URL is `http://` on an HTTPS page | Use `https://` |
| 404 on the login call | Path has a `/v1` in it | Drop it — `POST /api/auth/login` |
| Signs in then bounces back | Cookie rejected across domains | Set `COOKIE_SAMESITE=none` and `COOKIE_DOMAIN` |

**5. Still stuck?** `pm2 logs resto-api` shows every request with its status,
and the startup banner shows exactly which origins the API will accept.
