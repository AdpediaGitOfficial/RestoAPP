import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { closePool, query } from './db/index.js';
import { initRealtime } from './realtime/io.js';

const app = createApp();
const server = http.createServer(app);
initRealtime(server);

try {
  await query('SELECT 1');
  console.log('[api] database connection ok');
} catch (err) {
  console.error('[api] cannot reach the database:', err.message);
  console.error('[api] check DATABASE_URL and run `npm run db:migrate`');
  process.exit(1);
}

server.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port} (${config.env})`);
  console.log(`[api] printer driver: ${config.printer.driver}`);
});

const shutdown = async (signal) => {
  console.log(`\n[api] ${signal} received, shutting down`);
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
