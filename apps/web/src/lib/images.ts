import { apiUrl } from './api';

/**
 * Photos uploaded through the admin panel are stored as a path relative to
 * the API (`/uploads/…`), not a full URL — so moving the API to a new domain
 * does not orphan every image. External URLs are still allowed and pass
 * through untouched.
 */
const isUpload = (url: string) => url.startsWith('/uploads/');

export function resolveImage(url: string | null | undefined): string | null {
  if (!url) return null;
  if (isUpload(url)) return `${apiUrl()}${url}`;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** The small rendition, for grid cards and cart thumbnails. */
export function resolveThumb(url: string | null | undefined): string | null {
  if (!url) return null;
  if (isUpload(url)) return `${apiUrl()}${url.replace('-lg.webp', '-sm.webp')}`;
  return resolveImage(url);
}
