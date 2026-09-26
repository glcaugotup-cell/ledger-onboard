const cron = require('node-cron');
const env = require('../config/env');

/**
 * The app's single daily scheduler (ACCOUNT_LIFECYCLE_CRON, daily by default). Each run:
 *  1. AccountLifecycleService.runDailySweep() — inactivity warnings/archiving.
 *  2. BillingReminderService.runSweep() — 7-day and 3-day bill due-date reminders.
 * Each step is isolated so one failing never skips the other. Services are
 * required lazily so module load order doesn't matter.
 */
async function runDailyJobs() {
  try {
    // Required lazily to avoid a circular-require at module load time.
    const AccountLifecycleService = require('../services/AccountLifecycleService');
    await AccountLifecycleService.runDailySweep();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[AccountLifecycleJob] sweep failed:', err);
  }
  try {
    const BillingReminderService = require('../services/BillingReminderService');
    await BillingReminderService.runSweep();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[AccountLifecycleJob] bill reminder sweep failed:', err);
  }
}

function startAccountLifecycleJob() {
  if (env.isTest) return null; // never run the real cron schedule under tests

  const task = cron.schedule(env.lifecycleCron, runDailyJobs);

  // The free hosting plan sleeps when idle and can miss the scheduled time, so
  // bill reminders are also checked once at startup (the sweep never double-sends).
  setTimeout(() => {
    const BillingReminderService = require('../services/BillingReminderService');
    BillingReminderService.runSweep().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[AccountLifecycleJob] startup bill reminder sweep failed:', err);
    });
  }, 10000).unref();

  // eslint-disable-next-line no-console
  console.log(`[AccountLifecycleJob] scheduled with cron "${env.lifecycleCron}" (account lifecycle + bill reminders)`);
  return task;
}

module.exports = { startAccountLifecycleJob, runDailyJobs };
