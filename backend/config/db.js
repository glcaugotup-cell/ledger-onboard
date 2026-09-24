const dns = require('dns');
const mongoose = require('mongoose');
const env = require('./env');

let connected = false;

// mongodb+srv:// needs a DNS SRV lookup. On some Windows setups Node's resolver
// fails it (ECONNREFUSED) even though the OS resolver works, so use public DNS.
if (env.mongoUri.startsWith('mongodb+srv://')) {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
}

const CONNECT_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectDB() {
  if (connected) return mongoose.connection;

  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt += 1) {
    try {
      await mongoose.connect(env.mongoUri, {
        // Free-tier Atlas clusters can take over 30s to wake from idle.
        serverSelectionTimeoutMS: 45000,
      });
      connected = true;
      // eslint-disable-next-line no-console
      console.log(`[db] MongoDB connected -> ${mongoose.connection.host}/${mongoose.connection.name}`);
      break;
    } catch (err) {
      const isLastAttempt = attempt === CONNECT_RETRIES;
      // eslint-disable-next-line no-console
      console.error(`[db] MongoDB connection attempt ${attempt}/${CONNECT_RETRIES} failed:`, err.message);
      if (isLastAttempt) {
        // eslint-disable-next-line no-console
        console.error('[db] Giving up after', CONNECT_RETRIES, 'attempts.');
        process.exit(1);
      }
      // eslint-disable-next-line no-console
      console.warn(`[db] Retrying in ${RETRY_DELAY_MS / 1000}s (this is normal for a free-tier Atlas cluster waking from idle)…`);
      // eslint-disable-next-line no-await-in-loop
      await sleep(RETRY_DELAY_MS);
    }
  }

  mongoose.connection.on('disconnected', () => {
    connected = false;
    // eslint-disable-next-line no-console
    console.warn('[db] MongoDB disconnected');
  });

  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
  connected = false;
}

module.exports = { connectDB, disconnectDB };
