const cron = require('node-cron');
const env = require('../config/env');

/**
 * Schedules AccountLifecycleService.runDailySweep() (daily by default).
 * The service is required lazily so module load order doesn't matter.
 */
function startAccountLifecycleJob() {
  if (env.isTest) return null; // never run the real cron schedule under tests

  const task = cron.schedule(env.lifecycleCron, async () => {
    try {
      // Required lazily to avoid a circular-require at module load time.
      const AccountLifecycleService = require('../services/AccountLifecycleService');
      await AccountLifecycleService.runDailySweep();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AccountLifecycleJob] sweep failed:', err);
    }
  });

  // eslint-disable-next-line no-console
  console.log(`[AccountLifecycleJob] scheduled with cron "${env.lifecycleCron}"`);
  return task;
}

module.exports = { startAccountLifecycleJob };
