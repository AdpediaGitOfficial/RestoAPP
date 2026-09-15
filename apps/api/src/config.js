import 'dotenv/config';

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
  seed: {
    adminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@restoapp.local',
    adminPassword: process.env.SEED_ADMIN_PASSWORD || 'admin12345',
  },
};

if (config.isProd && config.jwt.secret === 'dev-only-insecure-secret') {
  throw new Error('JWT_SECRET must be set in production');
}
