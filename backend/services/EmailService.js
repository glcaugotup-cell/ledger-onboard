const nodemailer = require('nodemailer');
const env = require('../config/env');
const { buildEmail } = require('../utils/emailTemplate');

/**
 * Sends transactional email (OTP, caretaker activation, archive warnings,
 * verification notices). In development (EMAIL_TRANSPORT=console) it just
 * logs the message instead of requiring real SMTP credentials.
 */
class EmailService {
  constructor() {
    this._transporter = null;
  }

  _getTransporter() {
    if (this._transporter) return this._transporter;
    if (env.emailTransport === 'console') {
      this._transporter = null; // handled explicitly in send()
      return null;
    }
    this._transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
    return this._transporter;
  }

  async send({ to, subject, text, html }) {
    if (env.emailTransport === 'console') {
      // eslint-disable-next-line no-console
      console.log(`\n[EmailService] ---- (console transport, not actually sent) ----`);
      // Never print real one-time codes in production logs (this transport is meant for development).
      const loggedText = env.isProduction ? String(text).replace(/\b\d{6}\b/g, '******') : text;
      // eslint-disable-next-line no-console
      console.log(`To: ${to}\nSubject: ${subject}\n${loggedText}\n---------------------------------------------\n`);
      return { accepted: [to], messageId: 'console-transport' };
    }

    const transporter = this._getTransporter();
    return transporter.sendMail({ from: env.emailFrom, to, subject, text, html });
  }

  _sendMessage(to, subject, content) {
    return this.send({ to, subject, ...buildEmail({ appUrl: env.emailAppUrl, ...content }) });
  }

  _appLink(path) {
    return new URL(path, env.emailAppUrl).href;
  }

  sendOtpEmail(to, code, purpose, firstName) {
    const purposeLabel =
      purpose === 'login_mfa' ? 'Login verification' : purpose === 'email_verification' ? 'Email verification' : 'Password reset';
    const subject =
      purpose === 'email_verification' ? 'Verify your Ledger OnBoard account' : `Ledger OnBoard — ${purposeLabel} code`;
    return this._sendMessage(to, subject, {
      category: 'Account security',
      title: purpose === 'email_verification' ? 'Verify your email address' : `${purposeLabel} code`,
      greeting: firstName ? `Hello ${firstName},` : 'Hello,',
      paragraphs: [`Enter this code on the ${purposeLabel.toLowerCase()} screen to continue.`],
      highlight: { label: 'Your verification code', value: code },
      details: [['Valid for', `${env.otpTtlMinutes} minutes`]],
      note: 'If you did not request this code, you can ignore this email. Keep the code private and do not share it with anyone.',
    });
  }

  sendCaretakerActivationEmail(to, fullName, activationUrl, landlordName) {
    const invitedBy = landlordName ? ` by ${landlordName}` : '';
    return this._sendMessage(to, 'Ledger OnBoard Caretaker Invitation', {
      category: 'Caretaker invitation',
      title: "You're invited to join",
      greeting: `Hi ${fullName},`,
      paragraphs: [
        `You have been invited${invitedBy} to become a caretaker on Ledger OnBoard.`,
        'Activate your account and choose a strong personal password to get started.',
      ],
      details: [['Invitation expires', 'In 3 days']],
      action: { label: 'Activate my account', url: activationUrl },
      note: 'This invitation link expires in 3 days. If you did not expect this invitation, you can safely ignore this email.',
    });
  }

  sendCaretakerCreatedEmail(to, fullName, activationUrl, landlordName, temporaryPassword) {
    const invitedBy = landlordName ? ` by ${landlordName}` : '';
    return this._sendMessage(to, 'Ledger OnBoard Caretaker Invitation', {
      category: 'Caretaker invitation',
      title: "You're invited to join",
      greeting: `Hi ${fullName},`,
      paragraphs: [
        `You have been invited${invitedBy} to become a caretaker on Ledger OnBoard.`,
        'Use the button below to choose a strong personal password and activate your account before accessing your dashboard.',
      ],
      highlight: { label: 'Temporary password', value: temporaryPassword },
      details: [['Your role', 'Caretaker'], ['Invitation expires', 'In 3 days']],
      action: { label: 'Activate my account', url: activationUrl },
      note: 'This link expires in 3 days. Keep this invitation private. If you did not expect it, you can safely ignore this email.',
    });
  }

  sendArchiveWarningEmail(to, fullName, daysRemaining) {
    return this._sendMessage(to, 'Ledger OnBoard — Your account will be archived soon', {
      category: 'Account activity', title: 'Keep your account active', greeting: `Hi ${fullName},`,
      paragraphs: [`Your Ledger OnBoard account has been inactive. It will be archived in ${daysRemaining} days unless you log in before then.`],
      action: { label: 'Sign in to my account', url: this._appLink('/login') },
      note: 'Archived accounts can be recovered afterward using account recovery.',
    });
  }

  sendArchivedNoticeEmail(to, fullName) {
    return this._sendMessage(to, 'Ledger OnBoard — Your account has been archived', {
      category: 'Account activity', title: 'Your account has been archived', greeting: `Hi ${fullName},`,
      paragraphs: ['Your Ledger OnBoard account was archived due to prolonged inactivity. Your history is preserved. Use account recovery to reactivate it.'],
      action: { label: 'Recover my account', url: this._appLink('/account-recovery') },
    });
  }

  sendPaymentVerifiedEmail(to, fullName, amount) {
    return this._sendMessage(to, 'Ledger OnBoard — Payment verified', {
      category: 'Payment update', title: 'Your payment is verified', greeting: `Hi ${fullName},`,
      paragraphs: [`Your payment of PHP ${amount} has been verified. Thank you.`],
      details: [['Amount verified', `PHP ${amount}`], ['Status', 'Verified']],
      action: { label: 'View my billing', url: this._appLink('/tenant/billing') },
    });
  }

  sendPaymentRejectedEmail(to, fullName, reason) {
    return this._sendMessage(to, 'Ledger OnBoard — Payment could not be verified', {
      category: 'Payment update', title: 'Your payment needs attention', greeting: `Hi ${fullName},`,
      paragraphs: ['Your submitted payment could not be verified. Please contact your landlord/caretaker or resubmit proof.'],
      details: [['Reason', reason || 'Not specified']],
      action: { label: 'Review my payment', url: this._appLink('/tenant/billing') },
    });
  }

  sendBillReminderEmail(to, fullName, { periodLabel, amount, dueDateLabel, daysRemaining, reference }) {
    const when = daysRemaining === 0 ? 'today' : `in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} (${dueDateLabel})`;
    return this._sendMessage(to, `Ledger OnBoard — Your ${periodLabel} bill is due ${daysRemaining === 0 ? 'today' : `in ${daysRemaining} days`}`, {
      category: 'Billing reminder', title: `Your bill is due ${daysRemaining === 0 ? 'today' : `in ${daysRemaining} days`}`,
      greeting: `Hi ${fullName},`,
      paragraphs: [`Your statement of account for ${periodLabel} (ref. ${reference}) is due ${when}. You can review the bill and submit your payment on Ledger OnBoard.`],
      details: [['Billing period', periodLabel], ['Reference', reference], ['Amount due', `PHP ${amount}`], ['Due date', dueDateLabel]],
      action: { label: 'View my bill', url: this._appLink('/tenant/billing') },
      note: 'If you have already paid, you can ignore this reminder.',
    });
  }

  sendBusinessVerificationApprovedEmail(to, fullName) {
    return this._sendMessage(to, 'Ledger OnBoard — Business verification approved', {
      category: 'Business verification', title: 'Your business is verified', greeting: `Hi ${fullName},`,
      paragraphs: ['Your submitted documents have been reviewed and your business is now verified. You can now upload and publish boarding house listings.'],
      action: { label: 'Manage my properties', url: this._appLink('/landlord/properties') },
    });
  }

  sendBusinessVerificationRejectedEmail(to, fullName, reason) {
    return this._sendMessage(to, 'Ledger OnBoard — Business verification needs attention', {
      category: 'Business verification', title: 'Your documents need attention', greeting: `Hi ${fullName},`,
      paragraphs: ["Your submitted business verification documents could not be approved. Please correct and resubmit your Mayor's/Business Permit and BIR Form 2303."],
      details: [['Reason', reason || 'Not specified']],
      action: { label: 'Review my verification', url: this._appLink('/landlord/verification') },
    });
  }
}

module.exports = new EmailService();
