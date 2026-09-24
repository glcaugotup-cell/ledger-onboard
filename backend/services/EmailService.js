const nodemailer = require('nodemailer');
const env = require('../config/env');

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
      // eslint-disable-next-line no-console
      console.log(`To: ${to}\nSubject: ${subject}\n${text}\n---------------------------------------------\n`);
      return { accepted: [to], messageId: 'console-transport' };
    }

    const transporter = this._getTransporter();
    return transporter.sendMail({ from: env.emailFrom, to, subject, text, html });
  }

  sendOtpEmail(to, code, purpose, firstName) {
    const purposeLabel =
      purpose === 'login_mfa' ? 'Login verification' : purpose === 'email_verification' ? 'Email verification' : 'Password reset';
    const subject =
      purpose === 'email_verification' ? 'Verify your Ledger OnBoard account' : `Ledger OnBoard — ${purposeLabel} code`;
    const greeting = firstName ? `Hello ${firstName},` : 'Hello,';
    return this.send({
      to,
      subject,
      text: `${greeting}\n\nYour ${purposeLabel.toLowerCase()} code is:\n\n${code}\n\nThis code will expire in ${env.otpTtlMinutes} minutes.\n\nIf you did not request this code, you can ignore this email.\n\nLedger OnBoard`,
    });
  }

  sendCaretakerActivationEmail(to, fullName, activationUrl, landlordName) {
    const invitedBy = landlordName ? ` by ${landlordName}` : '';
    return this.send({
      to,
      subject: 'Ledger OnBoard Caretaker Invitation',
      text: `Hi ${fullName},\n\nYou have been invited${invitedBy} to become a caretaker on Ledger OnBoard.\n\nTo activate your caretaker account and set your password, open this link:\n${activationUrl}\n\nThis invitation link expires in 3 days.\n\nIf you did not expect this invitation, you can safely ignore this email — no account changes will be made.\n\nRegards,\nLedger OnBoard\nledgeronboard@gmail.com`,
    });
  }

  sendArchiveWarningEmail(to, fullName, daysRemaining) {
    return this.send({
      to,
      subject: 'Ledger OnBoard — Your account will be archived soon',
      text: `Hi ${fullName},\n\nYour Ledger OnBoard account has been inactive. It will be archived in ${daysRemaining} days unless you log in before then. Archived accounts can be recovered afterward via the account recovery flow.`,
    });
  }

  sendArchivedNoticeEmail(to, fullName) {
    return this.send({
      to,
      subject: 'Ledger OnBoard — Your account has been archived',
      text: `Hi ${fullName},\n\nYour Ledger OnBoard account was archived due to prolonged inactivity. Your history is preserved. Use the account recovery flow if you'd like to reactivate it.`,
    });
  }

  sendPaymentVerifiedEmail(to, fullName, amount) {
    return this.send({
      to,
      subject: 'Ledger OnBoard — Payment verified',
      text: `Hi ${fullName},\n\nYour payment of PHP ${amount} has been verified. Thank you.`,
    });
  }

  sendPaymentRejectedEmail(to, fullName, reason) {
    return this.send({
      to,
      subject: 'Ledger OnBoard — Payment could not be verified',
      text: `Hi ${fullName},\n\nYour submitted payment could not be verified. Reason: ${reason || 'Not specified'}. Please contact your landlord/caretaker or resubmit proof.`,
    });
  }

  sendBusinessVerificationApprovedEmail(to, fullName) {
    return this.send({
      to,
      subject: 'Ledger OnBoard — Business verification approved',
      text: `Hi ${fullName},\n\nYour submitted documents have been reviewed and your business is now verified. You can now upload and publish boarding house listings.`,
    });
  }

  sendBusinessVerificationRejectedEmail(to, fullName, reason) {
    return this.send({
      to,
      subject: 'Ledger OnBoard — Business verification needs attention',
      text: `Hi ${fullName},\n\nYour submitted business verification documents could not be approved. Reason: ${reason || 'Not specified'}. Please correct and resubmit your Mayor's/Business Permit and BIR Form 2303.`,
    });
  }
}

module.exports = new EmailService();
