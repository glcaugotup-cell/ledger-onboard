const BillingSOARepository = require('../repositories/BillingSOARepository');
const UserRepository = require('../repositories/UserRepository');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const { calendarDaysBetween, APP_TIME_ZONE } = require('../utils/dates');
const { ACCOUNT_STATUS } = require('../utils/constants');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reminder stages, checked from the latest to the earliest. */
const STAGES = [
  { key: 'threeDay', days: 3 },
  { key: 'sevenDay', days: 7 },
];

const moneyFormat = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-PH', { timeZone: APP_TIME_ZONE, month: 'long', day: 'numeric', year: 'numeric' });
const periodFormat = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'long', year: 'numeric' });

/**
 * Advance reminders for unpaid bills: one 7 days before the due date and one 3
 * days before it (Philippine calendar days). Each stage is sent at most once per
 * bill, recorded on the bill itself; if a bill is first seen 3 or fewer days out,
 * only the 3-day reminder goes out. Bills past their due date are left to the
 * existing overdue handling in BillingService.
 *
 * Runs from the daily scheduled job, and also for one tenant whenever they sign in
 * or open their bills, because the free hosting plan can sleep through the daily run.
 */
class BillingReminderService {
  async runSweep(now = new Date()) {
    return this._remind(await BillingSOARepository.findDueBetween(now, new Date(now.getTime() + 8 * DAY_MS)), now);
  }

  async runForTenant(tenantId, now = new Date()) {
    return this._remind(await BillingSOARepository.findDueBetween(now, new Date(now.getTime() + 8 * DAY_MS), { tenantId }), now);
  }

  async _remind(soas, now) {
    const results = { sent: 0, skipped: 0 };
    for (const soa of soas) {
      // eslint-disable-next-line no-await-in-loop
      const sent = await this._remindOne(soa, now);
      results[sent ? 'sent' : 'skipped'] += 1;
    }
    return results;
  }

  async _remindOne(soa, now) {
    const daysRemaining = calendarDaysBetween(now, soa.dueDate);
    if (daysRemaining < 0 || daysRemaining > 7) return false;
    const stage = STAGES.find((s) => daysRemaining <= s.days);
    if (soa.reminders?.[`${stage.key}SentAt`]) return false;

    const tenant = await UserRepository.findById(soa.tenantId);
    if (!tenant || tenant.accountStatus !== ACCOUNT_STATUS.ACTIVE) return false;

    // Claim first: only the caller that flips the flag sends, so a reminder can't be duplicated.
    const claimed = await BillingSOARepository.claimReminder(soa._id, stage.key, now);
    if (!claimed) return false;

    const periodLabel = periodFormat.format(soa.billingPeriod);
    const dueDateLabel = dateFormat.format(soa.dueDate);
    const amount = moneyFormat.format(soa.remainingBalance);
    const reference = String(soa._id).slice(-6).toUpperCase();
    const when = daysRemaining === 0 ? 'today' : `in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;

    await NotificationService.notify({
      userId: soa.tenantId,
      type: stage.key === 'sevenDay' ? 'BILL_DUE_IN_7_DAYS' : 'BILL_DUE_IN_3_DAYS',
      title: `Bill due ${when}`,
      message: `Your ${periodLabel} bill (ref. ${reference}) of ₱${amount} is due on ${dueDateLabel}, ${when === 'today' ? 'today' : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} from now`}.`,
      relatedType: 'BillingSOA',
      relatedId: soa._id,
    });

    if (tenant.notificationPreferences?.email !== false) {
      try {
        await EmailService.sendBillReminderEmail(tenant.email, tenant.fullName, { periodLabel, amount, dueDateLabel, daysRemaining, reference });
      } catch (err) {
        // The in-app reminder already went out; a failed email is logged, not retried.
        // eslint-disable-next-line no-console
        console.error('[BillingReminderService] reminder email failed:', err.message);
      }
    }
    return true;
  }
}

module.exports = new BillingReminderService();
