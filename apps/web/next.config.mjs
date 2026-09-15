const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;

// A production build with no API URL is almost always a mistake, and the
// symptom (the browser calling localhost) only shows up once it is deployed.
// Next spawns build workers that each re-evaluate this file; the flag is
// inherited by children, so the banner prints once.
if (process.env.NODE_ENV === 'production' && !process.env.__RESTO_WEB_BANNER) {
  process.env.__RESTO_WEB_BANNER = '1';

  if (!apiUrl) {
    console.warn(
      '\n[web] WARNING: neither API_URL nor NEXT_PUBLIC_API_URL is set.\n'
      + '[web] The bundle will fall back to http://localhost:4000.\n'
      + '[web] Set API_URL on the server (read at runtime via /env.js) or rebuild with NEXT_PUBLIC_API_URL.\n',
    );
  } else if (/localhost|127\.0\.0\.1/.test(apiUrl)) {
    console.warn(`\n[web] WARNING: API URL is ${apiUrl}, which will not work from a phone or a real domain.\n`);
  } else {
    console.log(`[web] API URL: ${apiUrl}`);
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
};

export default nextConfig;
