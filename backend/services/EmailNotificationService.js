const EmailService = require('./EmailService');
const env = require('../config/env');

/** Routine mail needs explicit inbox proof and consent. Security notices ignore routine opt-out. */
class EmailNotificationService {
  async deliver(user, method, args = [], { security = false } = {}) {
    const reason = !user?.emailConfirmedAt ? 'inbox_unconfirmed'
      : !security && user.notificationPreferences?.email !== true ? 'email_disabled' : null;
    if (reason) {
      if (env.isProduction) console.info('[EmailNotificationService]', { event: 'skipped', reason });
      return { skipped: true };
    }
    return EmailService[method](user.email, ...args);
  }

  async securityNotice(user, event) {
    try {
      return await this.deliver(user, 'sendSecurityNoticeEmail', [user.firstName || user.fullName, event], { security: true });
    } catch {
      // The security change is complete; never undo it because its extra notice failed.
      console.error('[EmailNotificationService] Security notice failed; account change is saved.');
      return { skipped: true };
    }
  }
}
module.exports = new EmailNotificationService();
