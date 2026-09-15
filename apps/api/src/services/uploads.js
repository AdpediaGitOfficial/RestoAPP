import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest } from '../lib/errors.js';

/**
 * Menu photography.
 *
 * Everything uploaded is re-encoded through sharp rather than stored as sent.
 * That is deliberate: it means the bytes on disk are produced by our encoder,
 * so a file that merely claims to be a JPEG — or a real image with a payload
 * appended — cannot survive the round trip. It also strips EXIF, which on a
 * phone photo usually carries the GPS location of the restaurant.
 *
 * Two renditions are written, because the grid shows a ~180px card and the
 * item sheet a full-width hero; serving one 1000px file to both would undo
 * the work done to make the menu load quickly.
 */

const RENDITIONS = [
  { suffix: 'lg', width: 1000, quality: 78 },
  { suffix: 'sm', width: 400, quality: 72 },
];

export const UPLOAD_ROUTE = '/uploads';

/** Where files live on disk. Configurable so it can sit outside the repo. */
export const uploadDir = () => path.resolve(config.uploads.dir);

export async function ensureUploadDir() {
  await fs.mkdir(uploadDir(), { recursive: true });
  return uploadDir();
}

/** A local upload path looks like /uploads/<32 hex>-lg.webp and nothing else. */
const LOCAL_UPLOAD = /^\/uploads\/[a-f0-9]{32}-(lg|sm)\.webp$/;

export const isLocalUpload = (url) => typeof url === 'string' && LOCAL_UPLOAD.test(url);

/** The small rendition that belongs to a stored image. */
export const thumbFor = (url) => (isLocalUpload(url) ? url.replace('-lg.webp', '-sm.webp') : url);

export async function processAndStore(buffer, originalName = '') {
  if (!buffer?.length) throw badRequest('No image was uploaded');

  // sharp refuses anything that is not actually decodable, which is the real
  // check — a Content-Type header is just a claim by the uploader.
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch {
    throw badRequest('That file is not an image we can read. Try a JPEG, PNG or WebP.');
  }

  if (!meta.width || !meta.height) throw badRequest('That image appears to be empty');
  if (meta.width < 200 || meta.height < 200) {
    throw badRequest(`That image is only ${meta.width}×${meta.height}. Please use one at least 200×200.`);
  }
  // A "decompression bomb": small file, enormous canvas.
  if (meta.width * meta.height > 50_000_000) {
    throw badRequest('That image is too large to process. Please resize it first.');
  }

  const id = crypto.randomBytes(16).toString('hex');
  const dir = await ensureUploadDir();

  const written = [];
  try {
    for (const r of RENDITIONS) {
      const filename = `${id}-${r.suffix}.webp`;
      const output = await sharp(buffer)
        .rotate()                       // apply EXIF orientation before it is stripped
        .resize({ width: r.width, withoutEnlargement: true })
        .webp({ quality: r.quality })
        .toBuffer();
      await fs.writeFile(path.join(dir, filename), output);
      written.push({ filename, bytes: output.length });
    }
  } catch (err) {
    // Never leave half an image behind.
    await Promise.all(written.map((w) => fs.rm(path.join(dir, w.filename), { force: true })));
    throw err;
  }

  const [large, small] = written;
  return {
    url: `${UPLOAD_ROUTE}/${large.filename}`,
    thumbUrl: `${UPLOAD_ROUTE}/${small.filename}`,
    width: Math.min(meta.width, RENDITIONS[0].width),
    originalName: originalName.slice(0, 120),
    originalBytes: buffer.length,
    storedBytes: written.reduce((n, w) => n + w.bytes, 0),
  };
}

/** Remove both renditions. Ignores anything that is not one of our own files. */
export async function removeUpload(url) {
  if (!isLocalUpload(url)) return false;
  const dir = uploadDir();
  await Promise.all([url, thumbFor(url)].map((u) => {
    // Resolve and confirm the path stays inside the upload directory.
    const target = path.resolve(dir, path.basename(u));
    if (path.dirname(target) !== dir) return null;
    return fs.rm(target, { force: true });
  }));
  return true;
}
