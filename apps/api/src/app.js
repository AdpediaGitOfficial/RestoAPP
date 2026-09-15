import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, configSummary } from './config.js';
import { errorHandler } from './lib/errors.js';
import { authRoutes } from './routes/auth.routes.js';
import { publicRoutes } from './routes/public.routes.js';
import { staffRoutes } from './routes/staff.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { query } from './db/index.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({
    origin(origin, cb) {
      // Allow same-origin / server-to-server calls with no Origin header.
      if (!origin || config.corsOrigins.includes(origin)) return cb(null, true);
      const err = new Error(
        `Origin ${origin} is not in CORS_ORIGINS (currently: ${config.corsOrigins.join(', ') || 'none'}). `
        + 'Add it to the API environment and restart.',
      );
      err.status = 403;
      err.code = 'CORS_ORIGIN_NOT_ALLOWED';
      return cb(err);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!config.isProd) app.use(morgan('dev'));

  const ROUTES = {
    health: 'GET /health',
    guest: {
      table: 'GET /api/public/tables/:qrToken',
      menu: 'GET /api/public/menu',
      placeOrder: 'POST /api/public/orders',
      session: 'GET /api/public/sessions/:id?token=:qrToken',
      requestBill: 'POST /api/public/sessions/:id/request-bill',
      callWaiter: 'POST /api/public/sessions/:id/call-waiter',
    },
    auth: {
      login: 'POST /api/auth/login',
      logout: 'POST /api/auth/logout',
      me: 'GET /api/auth/me',
    },
    staff: {
      tables: 'GET /api/staff/tables',
      orders: 'GET /api/staff/orders?active=true',
      generateBill: 'POST /api/staff/sessions/:id/bill',
      settleBill: 'POST /api/staff/bills/:id/settle',
    },
    admin: {
      menuItems: 'GET /api/admin/menu-items',
      tables: 'GET /api/admin/tables',
      settings: 'GET /api/admin/settings',
      dailyMetrics: 'GET /api/admin/metrics/daily',
    },
  };

  // Hitting the base URL should tell you what this service is and how to
  // call it — a bare 404 sends people hunting for a /v1 that never existed.
  const index = (_req, res) => res.json({
    service: 'RestoAPP API',
    version: '1.0.0',
    note: 'There is no /v1 prefix. Every path below is complete as written.',
    routes: ROUTES,
  });
  app.get('/', index);
  app.get('/api', index);

  app.get('/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: 'degraded', db: 'down', error: err.message });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/public', publicRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/admin', adminRoutes);

  app.use((req, res) => res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.path}`,
      hint: 'This API has no /v1 prefix. GET / lists every available route.',
      prefixes: ['/health', '/api/public', '/api/auth', '/api/staff', '/api/admin'],
    },
  }));
  app.use(errorHandler);

  return app;
}
