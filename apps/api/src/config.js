import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored to the package, so the upload directory does not move when the
// process is started from a different working directory.
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const bool = (v, d = false) => (v === undefined ? d : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10));

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: int(process.env.API_PORT, 4000),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://resto:resto@127.0.0.1:5432/restoapp',
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
    cookieName: 'resto_token',
  },
  cookie: {
    // Subdomains of one site (app.example.com + api.example.com) are
    // same-site, so 'lax' works. Only set 'none' when the API and the web
    // app are on genuinely different sites — and it then requires HTTPS.
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
  },
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  publicWebUrl: (process.env.PUBLIC_WEB_URL || 'http://localhost:3000').replace(/\/$/, ''),
  printer: {
    driver: process.env.PRINTER_DRIVER || 'none', // none | escpos
    host: process.env.PRINTER_HOST || '',
    port: int(process.env.PRINTER_PORT, 9100),
    charsPerLine: int(process.env.PRINTER_CHARS_PER_LINE, 42),
    cutPaper: bool(process.env.PRINTER_CUT_PAPER, true),
  },
  uploads: {
    // Keep this outside the working tree in production so a deploy cannot
    // wipe the restaurant's photos.
    dir: process.env.UPLOAD_DIR
      ? path.resolve(process.env.UPLOAD_DIR)
      : path.join(apiRoot, 'uploads'),
    maxBytes: int(process.env.UPLOAD_MAX_BYTES, 8 * 1024 * 1024),
  },
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@restoapp.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'admin12345',
  },
};

if (config.isProd && config.jwt.secret === 'dev-only-insecure-secret') {
  throw new Error('JWT_SECRET must be set in production');
}

if (config.cookie.sameSite === 'none' && !config.isProd) {
  console.warn('[config] COOKIE_SAMESITE=none requires HTTPS; browsers will reject the cookie over http');
}

/**
 * Problems that do not stop the server booting but will break the app in
 * ways that are hard to see from a log line. Printed at startup.
 */
export function configWarnings() {
  const warnings = [];

  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV is not set, so the API is running in development mode. Set NODE_ENV=production when deploying.');
  }
  if (config.jwt.secret === 'dev-only-insecure-secret') {
    warnings.push('JWT_SECRET is the built-in development value. Anyone who knows it can mint a valid admin token — set your own.');
  }
  if (config.corsOrigins.some((o) => o.includes('localhost')) && config.isProd) {
    warnings.push(`CORS_ORIGINS still contains a localhost entry: ${config.corsOrigins.join(', ')}`);
  }
  if (config.publicWebUrl.includes('localhost')) {
    warnings.push(`PUBLIC_WEB_URL is ${config.publicWebUrl}. QR codes embed this URL, so printed codes will not work off this machine.`);
  }
  return warnings;
}

/** One-line summary of the settings that decide whether the app can talk to itself. */
export function configSummary() {
  return {
    env: config.env,
    port: config.port,
    database: config.databaseUrl.replace(/\/\/([^:]+):[^@]*@/, '//$1:****@'),
    corsOrigins: config.corsOrigins,
    publicWebUrl: config.publicWebUrl,
    cookieSameSite: config.cookie.sameSite,
    cookieSecure: config.isProd,
    printerDriver: config.printer.driver,
  };
}
