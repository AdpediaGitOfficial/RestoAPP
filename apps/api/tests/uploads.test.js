import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Point the upload directory at a scratch folder before the module reads it.
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'resto-uploads-'));
process.env.UPLOAD_DIR = tmp;

const sharp = (await import('sharp')).default;
const { processAndStore, removeUpload, isLocalUpload, thumbFor, uploadDir } =
  await import('../src/services/uploads.js');

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 60 } } })
  .png().toBuffer();

after(() => fs.rm(tmp, { recursive: true, force: true }));

describe('upload paths', () => {
  test('recognises only its own generated filenames', () => {
    assert.ok(isLocalUpload('/uploads/' + 'a'.repeat(32) + '-lg.webp'));
    assert.ok(isLocalUpload('/uploads/' + 'f'.repeat(32) + '-sm.webp'));

    for (const bad of [
      '/uploads/../../etc/passwd',
      '/uploads/evil.php',
      '/uploads/short-lg.webp',
      '/uploads/' + 'a'.repeat(32) + '-lg.php',
      'https://example.com/photo.jpg',
      '',
      null,
    ]) {
      assert.equal(isLocalUpload(bad), false, `should reject: ${bad}`);
    }
  });

  test('derives the small rendition, and leaves external URLs alone', () => {
    const id = 'b'.repeat(32);
    assert.equal(thumbFor(`/uploads/${id}-lg.webp`), `/uploads/${id}-sm.webp`);
    assert.equal(thumbFor('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  });
});

describe('processing an upload', () => {
  test('writes two renditions and returns their paths', async () => {
    const stored = await processAndStore(await png(2400, 1600), 'photo.png');

    assert.match(stored.url, /^\/uploads\/[a-f0-9]{32}-lg\.webp$/);
    assert.match(stored.thumbUrl, /^\/uploads\/[a-f0-9]{32}-sm\.webp$/);

    for (const p of [stored.url, stored.thumbUrl]) {
      const file = path.join(uploadDir(), path.basename(p));
      assert.ok((await fs.stat(file)).size > 0, `${p} should exist`);
    }

    // Large is capped at 1000px; small at 400px.
    const large = await sharp(path.join(uploadDir(), path.basename(stored.url))).metadata();
    const small = await sharp(path.join(uploadDir(), path.basename(stored.thumbUrl))).metadata();
    assert.equal(large.format, 'webp');
    assert.equal(large.width, 1000);
    assert.equal(small.width, 400);
  });

  test('re-encodes, so metadata does not survive', async () => {
    const withExif = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#888' } })
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: 'somebody' } } })
      .toBuffer();

    const stored = await processAndStore(withExif);
    const meta = await sharp(path.join(uploadDir(), path.basename(stored.url))).metadata();
    assert.equal(meta.exif, undefined, 'EXIF (which carries GPS on phone photos) must be stripped');
  });

  test('rejects anything that is not a decodable image', async () => {
    await assert.rejects(
      () => processAndStore(Buffer.from('<?php system($_GET["c"]); ?>')),
      /not an image/i,
    );
  });

  test('rejects an empty upload', async () => {
    await assert.rejects(() => processAndStore(Buffer.alloc(0)), /No image/i);
    await assert.rejects(() => processAndStore(undefined), /No image/i);
  });

  test('rejects an image too small to be worth showing', async () => {
    const tiny = await png(80, 80);
    await assert.rejects(() => processAndStore(tiny), /at least 200/i);
  });

  test('leaves nothing behind when processing fails', async () => {
    const before = (await fs.readdir(uploadDir())).length;
    await assert.rejects(() => processAndStore(Buffer.from('not an image at all')));
    assert.equal((await fs.readdir(uploadDir())).length, before, 'no partial files');
  });
});

describe('removing an upload', () => {
  test('deletes both renditions', async () => {
    const stored = await processAndStore(await png(800, 600));
    assert.equal(await removeUpload(stored.url), true);

    for (const p of [stored.url, stored.thumbUrl]) {
      await assert.rejects(() => fs.stat(path.join(uploadDir(), path.basename(p))));
    }
  });

  test('refuses paths that are not its own', async () => {
    const outside = path.join(tmp, '..', 'resto-canary.txt');
    await fs.writeFile(outside, 'keep me');
    try {
      assert.equal(await removeUpload('/uploads/../resto-canary.txt'), false);
      assert.equal(await removeUpload('/etc/passwd'), false);
      assert.equal(await removeUpload('https://example.com/x.jpg'), false);
      assert.ok(await fs.stat(outside), 'the file outside the upload directory must survive');
    } finally {
      await fs.rm(outside, { force: true });
    }
  });
});
