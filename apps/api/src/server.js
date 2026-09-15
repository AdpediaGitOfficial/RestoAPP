import http from 'node:http';
import { createApp } from './app.js';
import { config, configSummary, configWarnings } from './config.js';
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
  const summary = configSummary();
  console.log(`[api] listening on http://localhost:${summary.port} (${summary.env})`);
  console.log(`[api] cors origins   : ${summary.corsOrigins.join(', ') || '(none)'}`);
  console.log(`[api] public web url : ${summary.publicWebUrl}`);
  console.log(`[api] auth cookie    : SameSite=${summary.cookieSameSite}; Secure=${summary.cookieSecure}`);
  console.log(`[api] printer driver : ${summary.printerDriver}`);

  // Misconfiguration here does not stop the server, but it does break login
  // and QR codes in ways that are invisible from a normal log line.
  for (const warning of configWarnings()) console.warn(`[api] WARNING: ${warning}`);
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
