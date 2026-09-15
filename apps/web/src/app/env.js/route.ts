/**
 * Runtime configuration for the browser.
 *
 * `NEXT_PUBLIC_*` values are compiled into the bundle at build time, so a
 * deployment that changes the API URL without rebuilding silently keeps
 * calling the old one. This route is evaluated per request instead, so
 * setting API_URL in the process environment and restarting is enough.
 *
 * Loaded by the root layout before hydration.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || '';

  return new Response(
    `window.__RESTO_API_URL__=${JSON.stringify(apiUrl)};`,
    {
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        // Must never be cached, or the whole point is lost.
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}
