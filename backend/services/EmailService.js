const nodemailer = require('nodemailer');
const env = require('../config/env');
const { buildEmail } = require('../utils/emailTemplate');

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

/** 'Ledger OnBoard <team@gmail.com>' (quotes optional) -> { name, email }; a bare address -> { email }. */
function parseSender(from) {
  const value = String(from || '').trim().replace(/^["']|["']$/g, '');
  const match = /^(.*)<([^>]+)>$/.exec(value);
  if (!match) return { email: value };
  const name = match[1].trim().replace(/^["']|["']$/g, '');
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

/**
 * Sends transactional email (OTP, caretaker activation, archive warnings,
 * verification notices) through one of three transports (EMAIL_TRANSPORT):
 *  - console: logs the message instead of sending (development and tests);
 *  - brevo:   Brevo's HTTPS API, for hosts that block outgoing SMTP ports (Render's free plan);
 *  - smtp (or any other value): an SMTP server such as Gmail with an App Password.
 * Every real send gives up after EMAIL_TIMEOUT_MS (10 s by default), so an unreachable
 * mail server makes the request fail with a clear error instead of hanging it.
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
      // Without these, a blocked SMTP port leaves the connection hanging for minutes.
      connectionTimeout: env.emailTimeoutMs,
      greetingTimeout: env.emailTimeoutMs,
      socketTimeout: env.emailTimeoutMs,
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

    if (env.emailTransport === 'brevo') return this._sendViaBrevo({ to, subject, text, html });

    const transporter = this._getTransporter();
    return transporter.sendMail({ from: env.emailFrom, to, subject, text, html });
  }

  /** Brevo transactional email over HTTPS (port 443), which hosting providers don't block. */
  async _sendViaBrevo({ to, subject, text, html }) {
    if (!env.brevoApiKey) throw new Error('EMAIL_TRANSPORT is "brevo" but BREVO_API_KEY is not set');
    const body = { sender: parseSender(env.emailFrom), to: [{ email: to }], subject };
    if (html) body.htmlContent = html;
    if (text) body.textContent = text;

    let res;
    try {
      res = await fetch(BREVO_SEND_URL, {
        method: 'POST',
        headers: { 'api-key': env.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(env.emailTimeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new Error(`Brevo did not respond within ${env.emailTimeoutMs} ms`);
      throw err;
    }
    if (!res.ok) {
      // Brevo explains the problem (e.g. unverified sender) in the body; it never echoes the API key.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Brevo rejected the email (HTTP ${res.status}): ${detail}`);
    }
    const data = await res.json().catch(() => ({}));
    return { accepted: [to], messageId: data.messageId || 'brevo' };
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

  /** Sent when a landlord approves a reservation: where, when, and who to contact to arrange the move-in. */
  sendReservationApprovedEmail(to, { tenantName, propertyName, location, roomNumber, moveInDate, holdUntil, landlord, caretaker }) {
    const details = [
      ['Property', propertyName],
      ['Address', location || '—'],
      ['Room', roomNumber],
      ['Move-in date', moveInDate],
      ['Room held until', holdUntil],
    ];
    if (landlord) {
      details.push(['Landlord', landlord.name], ['Landlord email', landlord.email], ['Landlord contact number', landlord.phone || 'Not provided']);
    }
    if (caretaker) {
      details.push(['Caretaker', caretaker.name], ['Caretaker contact number', caretaker.phone || 'Not provided']);
    }
    return this._sendMessage(to, `Your reservation is approved: ${propertyName}, Room ${roomNumber}`, {
      category: 'Reservation',
      title: 'Your reservation is approved',
      greeting: tenantName ? `Hi ${tenantName},` : 'Hello,',
      paragraphs: [
        `Good news! Your reservation for ${propertyName}, Room ${roomNumber} has been approved. You may move in on ${moveInDate}.`,
        `Next steps: Contact your landlord to arrange your move-in. Your room is held until ${holdUntil}.`,
      ],
      details,
      action: { label: 'View my reservation', url: this._appLink('/tenant/reservations') },
      note: 'Your landlord will confirm your move-in in Ledger OnBoard once you arrive.',
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
