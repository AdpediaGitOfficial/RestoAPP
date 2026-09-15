import GuestApp from '@/components/guest/GuestApp';
import type { Category } from '@/lib/types';
import type { TableInfo } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The server fetches the table and the menu before the page is sent, so the
 * guest sees real content on first paint instead of a skeleton that waits for
 * JavaScript to download, hydrate and only then start a request.
 *
 * INTERNAL_API_URL lets this hop stay on the loopback interface — the browser
 * would otherwise have to open a fresh TLS connection to the API subdomain
 * before the first byte of the menu.
 */
const internalApi = () =>
  (process.env.INTERNAL_API_URL || process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000')
    .replace(/\/$/, '');

async function fetchJson<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${internalApi()}${path}`, {
      // The menu is shared and changes rarely; the table is per-guest state.
      next: revalidate > 0 ? { revalidate } : undefined,
      cache: revalidate > 0 ? undefined : 'no-store',
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    // Never let a slow or unreachable API block the page — the client will
    // fetch it again and show its own error state if it also fails.
    return null;
  }
}

export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const [table, menu] = await Promise.all([
    fetchJson<TableInfo>(`/api/public/tables/${encodeURIComponent(token)}`, 0),
    fetchJson<{ categories: Category[] }>('/api/public/menu', 30),
  ]);

  return <GuestApp token={token} initialTable={table} initialMenu={menu} />;
}
