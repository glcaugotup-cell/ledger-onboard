const EmailService = require('./EmailService');
const env = require('../config/env');
const { unsubscribeUrl } = require('../utils/unsubscribe');

/** Routine mail needs inbox proof and is on unless the user opts out. Security notices ignore routine opt-out. */
class EmailNotificationService {
  async deliver(user, method, args = [], { security = false } = {}) {
    const reason = !user?.emailConfirmedAt ? 'inbox_unconfirmed'
      : !security && user.notificationPreferences?.email === false ? 'email_disabled' : null;
    if (reason) {
      if (env.isProduction) console.info('[EmailNotificationService]', { event: 'skipped', reason });
      return { skipped: true };
    }
    // Security notices carry no unsubscribe link: they are not routine mail.
    const to = security ? user.email : { email: user.email, unsubscribeUrl: unsubscribeUrl(user._id) };
    return EmailService[method](to, ...args);
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
