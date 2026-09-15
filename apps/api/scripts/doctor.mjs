#!/usr/bin/env node
/**
 * Deployment checker. Run it on the server after `pm2 restart`:
 *
 *   node scripts/doctor.mjs                       # check config + database
 *   node scripts/doctor.mjs https://api.host.tld  # also probe a live URL
 *
 * Every check explains what to change when it fails.
 */
import 'dotenv/config';
import { config, configSummary, configWarnings } from '../src/config.js';
import { pool, closePool } from '../src/db/index.js';

const pass = (m) => console.log(`  ✅ ${m}`);
const warn = (m) => console.log(`  ⚠️  ${m}`);
const fail = (m) => console.log(`  ❌ ${m}`);

let failures = 0;
const section = (t) => console.log(`\n${t}\n${'─'.repeat(t.length)}`);

section('Configuration');
const summary = configSummary();
for (const [k, v] of Object.entries(summary)) {
  console.log(`  ${k.padEnd(16)} ${Array.isArray(v) ? v.join(', ') || '(none)' : v}`);
}
const warnings = configWarnings();
if (warnings.length) { console.log(''); warnings.forEach(warn); } else { console.log(''); pass('no configuration warnings'); }

section('Database');
try {
  await pool.query('SELECT 1');
  pass('connected');

  const { rows: migrations } = await pool.query(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'schema_migrations'`,
  );
  if (!migrations[0].n) {
    fail('schema_migrations is missing — run: npm run db:migrate');
    failures += 1;
  } else {
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM schema_migrations');
    pass(`${rows[0].n} migration(s) applied`);

    const { rows: users } = await pool.query(
      `SELECT role, count(*)::int AS n, count(*) FILTER (WHERE is_active)::int AS active
         FROM users GROUP BY role ORDER BY role`,
    );
    if (!users.length) {
      fail('no staff accounts exist, so nobody can sign in — run: npm run db:seed');
      failures += 1;
    } else {
      for (const u of users) {
        const line = `${u.n} ${u.role} account(s), ${u.active} active`;
        u.active > 0 ? pass(line) : fail(`${line} — every one is disabled`);
        if (!u.active) failures += 1;
      }
      if (!users.some((u) => u.role === 'ADMIN' && u.active > 0)) {
        fail('no active ADMIN account — the admin panel will be unreachable');
        failures += 1;
      }
    }

    const { rows: tables } = await pool.query('SELECT count(*)::int AS n FROM dining_tables WHERE is_active');
    tables[0].n ? pass(`${tables[0].n} active table(s) with QR codes`) : warn('no active tables — add them in the admin panel');

    const { rows: items } = await pool.query('SELECT count(*)::int AS n FROM menu_items WHERE is_active');
    items[0].n ? pass(`${items[0].n} menu item(s)`) : warn('the menu is empty — guests will see nothing to order');
  }
} catch (err) {
  fail(`cannot reach the database: ${err.message}`);
  fail('check DATABASE_URL, that PostgreSQL is running, and that the password is right');
  failures += 1;
}

const baseUrl = process.argv[2];
if (baseUrl) {
  const base = baseUrl.replace(/\/$/, '');
  section(`Live API at ${base}`);

  const probe = async (path, expect = 200) => {
    try {
      const res = await fetch(`${base}${path}`, { headers: { accept: 'application/json' } });
      const body = await res.text();
      if (res.status === expect) {
        pass(`${path} → ${res.status}`);
        return body;
      }
      fail(`${path} → ${res.status} (expected ${expect}) ${body.slice(0, 120)}`);
      failures += 1;
    } catch (err) {
      fail(`${path} → unreachable: ${err.message}`);
      failures += 1;
    }
    return null;
  };

  await probe('/health');
  await probe('/api/public/menu');

  // The browser sends an Origin header; CORS has to accept the web app's.
  for (const origin of config.corsOrigins) {
    try {
      const res = await fetch(`${base}/api/public/menu`, { headers: { Origin: origin } });
      const allowed = res.headers.get('access-control-allow-origin');
      allowed
        ? pass(`CORS accepts ${origin}`)
        : (fail(`CORS did not return a header for ${origin} — the browser will block it`), failures += 1);
    } catch (err) {
      fail(`CORS probe for ${origin} failed: ${err.message}`);
      failures += 1;
    }
  }
} else {
  section('Live API');
  console.log('  (skipped — pass a base URL to probe it, e.g. node scripts/doctor.mjs https://api.example.com)');
}

section(failures ? `${failures} problem(s) found` : 'All checks passed');
await closePool();
process.exit(failures ? 1 : 0);
