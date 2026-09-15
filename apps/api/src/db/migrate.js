#!/usr/bin/env node
/**
 * Tiny forward-only migration runner.
 * Every .sql file in ./migrations runs once, in filename order, and is
 * recorded in `schema_migrations`. `--reset` drops the schema first.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closePool } from './index.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function run() {
  const reset = process.argv.includes('--reset');
  const client = await pool.connect();
  try {
    if (reset) {
      console.log('[migrate] dropping schema public');
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    }
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      process.stdout.write(`[migrate] applying ${file} ... `);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log('ok');
        count += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        console.log('failed');
        throw err;
      }
    }
    console.log(count ? `[migrate] ${count} migration(s) applied` : '[migrate] already up to date');
  } finally {
    client.release();
    await closePool();
  }
}

run().catch((err) => {
  console.error('[migrate] error:', err.message);
  process.exit(1);
});
