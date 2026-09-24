const app = require('./app');
const env = require('./config/env');
const { connectDB } = require('./config/db');
const { startAccountLifecycleJob } = require('./jobs/AccountLifecycleJob');

async function main() {
  await connectDB();

  const server = app.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] Ledger OnBoard API listening on port ${env.port} (${env.nodeEnv})`);
  });

  // Daily (configurable) job that warns/archives inactive accounts.
  startAccountLifecycleJob();

  const shutdown = (signal) => {
    // eslint-disable-next-line no-console
    console.log(`[server] Received ${signal}, shutting down...`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
