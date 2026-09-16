#!/usr/bin/env node
/**
 * Fill in menu photography from Pexels.
 *
 *   npm run menu:photos -- --dry-run          show what each item would get
 *   npm run menu:photos                       fetch and assign
 *   npm run menu:photos -- --only "Cold Brew" --force
 *   npm run menu:photos -- --query "iced coffee" --only "Cold Brew" --force
 *
 * Downloads go through the same processAndStore() pipeline as a manual
 * upload, so imported photos get identical renditions, EXIF stripping and
 * validation. Items already carrying a photo are left alone unless --force.
 *
 * Needs PEXELS_API_KEY in the environment. A stock photo is not a photo of
 * your food — treat this as a way to launch, and replace the dishes that
 * matter with your own shots.
 */
import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { pool, closePool } from '../src/db/index.js';
import { processAndStore, removeUpload, isLocalUpload } from '../src/services/uploads.js';
import { searchQuery, pickPhoto, creditFor } from '../src/services/photo-search.js';

// Overridable so the import path can be exercised end to end against a local
// stand-in, without reaching out to Pexels.
const API = `${(process.env.PEXELS_API_BASE || 'https://api.pexels.com/v1').replace(/\/$/, '')}/search`;

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const opts = {
  dryRun: flag('dry-run'),
  force: flag('force'),
  only: value('only'),
  queryOverride: value('query'),
  limit: Number(value('limit')) || Infinity,
};

const key = process.env.PEXELS_API_KEY;
if (!key && !opts.dryRun) {
  console.error('\nPEXELS_API_KEY is not set.');
  console.error('Get a free key at https://www.pexels.com/api/ and add it to apps/api/.env\n');
  process.exit(1);
}

const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const skip = (m) => console.log(`  \x1b[90m·\x1b[0m ${m}`);
const bad = (m) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);

async function searchPexels(query) {
  const url = `${API}?query=${encodeURIComponent(query)}&orientation=landscape&per_page=15`;
  const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(20_000) });

  if (res.status === 429) throw new Error('Pexels rate limit reached — wait an hour, or re-run to resume');
  if (res.status === 401) throw new Error('Pexels rejected the API key');
  if (!res.ok) throw new Error(`Pexels returned ${res.status}`);

  const body = await res.json();
  return body.photos ?? [];
}

async function download(photo) {
  // large2x is ~1880px wide; the pipeline caps at 1000 so there is headroom
  // to crop without softening.
  const src = photo.src.large2x || photo.src.large;
  const res = await fetch(src, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`could not download the photo (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function run() {
  const { rows: items } = await pool.query(`
    SELECT m.id, m.name, m.image_url, c.name AS category_name
      FROM menu_items m JOIN categories c ON c.id = m.category_id
     WHERE m.is_active = true
     ORDER BY c.sort_order, m.sort_order, m.name`);

  const targets = items
    .filter((i) => (opts.only ? i.name.toLowerCase().includes(opts.only.toLowerCase()) : true))
    .filter((i) => (opts.force ? true : !i.image_url))
    .slice(0, opts.limit);

  const alreadyDone = items.filter((i) => i.image_url).length;
  console.log(`\n${items.length} active items · ${alreadyDone} already have a photo`);
  console.log(`${targets.length} to process${opts.dryRun ? '  (dry run — nothing will be written)' : ''}\n`);
  if (!targets.length) {
    console.log('Nothing to do. Use --force to replace existing photos.\n');
    return;
  }

  // Two dishes sharing a photo reads as a bug, so remember what we have used.
  const { rows: creditRows } = await pool.query(
    `SELECT image_credit->>'source_url' AS url FROM menu_items WHERE image_credit IS NOT NULL`);
  const used = new Set(creditRows.map((r) => (r.url || '').split('-').pop()).filter(Boolean));

  let imported = 0, skipped = 0, failed = 0;

  for (const [index, item] of targets.entries()) {
    const query = opts.queryOverride || searchQuery(item);
    const label = `${item.name} \x1b[90m→ "${query}"\x1b[0m`;

    if (opts.dryRun) { skip(label); skipped += 1; continue; }

    try {
      const photos = await searchPexels(query);
      const photo = pickPhoto(photos, { used });
      if (!photo) {
        bad(`${item.name} — no usable photo for "${query}" (try --query "…" --only "${item.name}" --force)`);
        failed += 1;
        continue;
      }
      used.add(String(photo.id));

      const buffer = await download(photo);
      const stored = await processAndStore(buffer, `${item.name}.jpg`);

      // Replacing a photo should not orphan the previous files.
      if (item.image_url && isLocalUpload(item.image_url)) await removeUpload(item.image_url).catch(() => {});

      await pool.query('UPDATE menu_items SET image_url = $2, image_credit = $3::jsonb WHERE id = $1',
        [item.id, stored.url, JSON.stringify(creditFor(photo))]);

      ok(`${item.name} \x1b[90m— ${(stored.storedBytes / 1024).toFixed(0)}KB · ${photo.photographer}\x1b[0m`);
      imported += 1;
    } catch (err) {
      bad(`${item.name} — ${err.message}`);
      failed += 1;
      if (/rate limit|API key/i.test(err.message)) break;
    }

    // Stay well inside the 200/hour allowance.
    if (index < targets.length - 1) await sleep(350);
  }

  console.log(`\n${imported} imported · ${skipped} skipped · ${failed} failed`);
  if (imported) {
    console.log('Review them in Admin → Menu; replace any poor match with the photo picker.');
  }
  if (failed) {
    console.log('Re-run to retry only the failures — items that succeeded are left alone.');
  }
  console.log();
}

run()
  .catch((err) => { console.error('\nimport failed:', err.message, '\n'); process.exitCode = 1; })
  .finally(closePool);
