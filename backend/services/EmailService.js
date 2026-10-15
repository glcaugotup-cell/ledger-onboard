const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const env = require('../config/env');
const { buildEmail } = require('../utils/emailTemplate');

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

/** 'Ledger OnBoard <team@gmail.com>' (quotes optional) -> { name, email }; a bare address -> { email }. */
function parseSender(from) {
  const value = String(from || '').trim().replace(/^["']|["']$/g, '');
  const match = /^(.*)<([^>]+)>$/.exec(value);
  if (!match) return { email: value };
  const name = match[1].trim().replace(/^["']|["']$/g, '');
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

// Classify provider responses without echoing their body (which may contain private data).
function rejectionReason(status, detail) {
  if (/\bip\b|ip address/i.test(detail) && /unauthori|not authori|unrecogni|unknown|block/i.test(detail)) return ['ip_not_authorized', 'Authorize the Render outbound IP ranges in Brevo'];
  if (/sender/i.test(detail) && /valid|verif|authori/i.test(detail)) return ['sender_invalid', 'sender not valid; verify EMAIL_FROM in the new Brevo account'];
  if (/suspend|activat|transactional.*(enable|disable)|sending.*(enable|disable)/i.test(detail)) return ['sending_not_enabled', 'Ask Brevo support to activate transactional sending'];
  if (status === 429 || /quota|credit|limit.*reach/i.test(detail)) return ['quota_exceeded', 'Check the Brevo sending quota'];
  if (status === 401) return ['authentication_failed', 'Check the new account BREVO_API_KEY (API key, not SMTP key)'];
  return ['provider_rejected', 'Check Brevo sending permissions and account status'];
}

/**
 * Sends transactional email (OTP, caretaker activation, archive warnings,
 * verification notices) through one of four transports (EMAIL_TRANSPORT, checked at boot):
 *  - console: logs the message instead of sending (development and tests);
 *  - brevo:   Brevo's HTTPS API, for hosts that block outgoing SMTP ports (Render's free plan);
 *  - smtp:    an SMTP server such as Gmail with an App Password;
 *  - none:    sends and logs nothing; callers get { skipped: true }.
 * Every real send gives up after EMAIL_TIMEOUT_MS (10 s by default), so an unreachable
 * mail server makes the request fail with a clear error instead of hanging it.
 */
class EmailService {
  constructor() {
    this._transporter = null;
  }

  /** Settings that decide whether email can go out. No secrets: only whether the key is set. */
  configurationSummary() {
    const sender = parseSender(env.emailFrom);
    return {
      transport: env.emailTransport,
      apiKeyConfigured: Boolean(env.brevoApiKey),
      gmailConfigured: Boolean(env.gmail.clientId && env.gmail.clientSecret && env.gmail.refreshToken),
      senderEmail: sender.email,
      senderFormatValid: /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender.email) && !/[\r\n]/.test(env.emailFrom),
      registrationVerificationRequired: env.emailVerificationRequired,
      accountFlowsEnabled: env.emailAccountFlowsEnabled,
    };
  }

  reportConfiguration() {
    const sender = parseSender(env.emailFrom);
    console.info('[EmailService] configuration', {
      transport: env.emailTransport, production: env.isProduction,
      apiKeyConfigured: Boolean(env.brevoApiKey), senderFormatValid: /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender.email) && !/[\r\n]/.test(env.emailFrom),
      registrationVerificationRequired: env.emailVerificationRequired,
      accountFlowsEnabled: env.emailAccountFlowsEnabled,
      emailMfaEnrollmentEnabled: env.emailMfaEnrollmentEnabled,
    });
    if (env.emailTransport === 'none' || (env.isProduction && env.emailTransport === 'console')) {
      console.warn('[EmailService] Real email sending is disabled on this server.');
    }
    if (env.emailTransport === 'gmail' && !(env.gmail.clientId && env.gmail.clientSecret && env.gmail.refreshToken)) {
      console.warn('[EmailService] GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and GMAIL_REFRESH_TOKEN are needed for EMAIL_TRANSPORT=gmail.');
    }
    if (env.emailTransport === 'brevo' && !env.brevoApiKey) {
      console.warn('[EmailService] BREVO_API_KEY is missing; add the new account API key in Render.');
    }
  }

  _diagnostic(event, details = {}) {
    if (!env.isProduction) return;
    const log = event === 'failed' ? console.error : console.info;
    log('[EmailService]', { event, transport: env.emailTransport, ...details });
  }

  _failure(reason, message, httpStatus) {
    this._diagnostic('failed', { reason, ...(httpStatus ? { httpStatus } : {}) });
    const error = new Error(message);
    error.emailReason = reason;
    if (httpStatus) error.httpStatus = httpStatus;
    return error;
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

  async send({ to, subject, text, html, unsubscribeUrl }) {
    // Nothing about the message is logged: it may hold a one-time code.
    // One-click unsubscribe (RFC 8058), which Gmail and Yahoo expect on routine mail.
    const headers = unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
    if (env.emailTransport === 'none') {
      this._diagnostic('skipped', { reason: 'transport_disabled' });
      return { skipped: true, reason: 'transport_disabled' };
    }

    if (env.emailTransport === 'console') {
      if (env.isProduction) {
        this._diagnostic('skipped', { reason: 'console_in_production' });
        return { skipped: true, reason: 'console_in_production' };
      }
      // eslint-disable-next-line no-console
      console.log(`\n[EmailService] ---- (console transport, not actually sent) ----`);
      // Never print real one-time codes in production logs (this transport is meant for development).
      const loggedText = env.isProduction ? String(text).replace(/\b\d{6}\b/g, '******') : text;
      // eslint-disable-next-line no-console
      console.log(`To: ${to}\nSubject: ${subject}\n${loggedText}\n---------------------------------------------\n`);
      return { accepted: [to], messageId: 'console-transport' };
    }

    if (env.emailTransport === 'brevo') return this._sendViaBrevo({ to, subject, text, html, headers });
    if (env.emailTransport === 'gmail') return this._sendViaGmail({ to, subject, text, html, headers });

    const transporter = this._getTransporter();
    return transporter.sendMail({ from: env.emailFrom, to, subject, text, html, headers });
  }

  /** Brevo transactional email over HTTPS (port 443), which hosting providers don't block. */
  async _sendViaBrevo({ to, subject, text, html, headers }) {
    if (!env.brevoApiKey) throw this._failure('missing_api_key', 'EMAIL_TRANSPORT is "brevo" but BREVO_API_KEY is not set');
    const sender = parseSender(env.emailFrom);
    if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender.email) || /[\r\n]/.test(env.emailFrom)) {
      throw this._failure('sender_invalid', 'Set EMAIL_FROM to the verified Brevo sender');
    }
    const body = { sender, to: [{ email: to }], subject };
    if (html) body.htmlContent = html;
    if (text) body.textContent = text;
    if (headers) body.headers = headers;

    let res;
    this._diagnostic('attempt');
    try {
      res = await fetch(BREVO_SEND_URL, {
        method: 'POST',
        headers: { 'api-key': env.brevoApiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(env.emailTimeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw this._failure('timeout', `Brevo did not respond within ${env.emailTimeoutMs} ms`);
      throw this._failure('network_error', 'Unable to reach Brevo over HTTPS');
    }
    if (!res.ok) {
      // Read only for classification; the raw provider response never enters logs or client errors.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      const [reason, advice] = rejectionReason(res.status, detail);
      throw this._failure(reason, `Brevo rejected the email (HTTP ${res.status}): ${advice}`, res.status);
    }
    const data = await res.json().catch(() => ({}));
    if (typeof data.messageId !== 'string' || !data.messageId.trim()) {
      throw this._failure('invalid_response', 'Brevo did not return a message ID; acceptance could not be confirmed');
    }
    this._diagnostic('accepted');
    return { accepted: [to], messageId: data.messageId };
  }

  /** `to` is an address, or { email, unsubscribeUrl } for routine mail the recipient can opt out of. */
  /** Short-lived Gmail access token from the refresh token, reused until a minute before it expires. */
  async _gmailAccessToken() {
    if (this._gmailToken && this._gmailToken.expiresAt > Date.now() + 60000) return this._gmailToken.value;
    const { clientId, clientSecret, refreshToken } = env.gmail;
    let res;
    try {
      res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
        signal: AbortSignal.timeout(env.emailTimeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw this._failure('timeout', `Google did not respond within ${env.emailTimeoutMs} ms`);
      throw this._failure('network_error', 'Unable to reach Google over HTTPS');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.access_token !== 'string') {
      // invalid_grant: the refresh token was revoked or expired; invalid_client: wrong client ID or secret.
      throw this._failure('gmail_auth_failed', `Google refused the Gmail credentials (${data.error || `HTTP ${res.status}`})`, res.status);
    }
    this._gmailToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
    return this._gmailToken.value;
  }

  /** Gmail API over HTTPS (port 443): sends as the Gmail account that granted the refresh token. */
  async _sendViaGmail({ to, subject, text, html, headers }) {
    const { clientId, clientSecret, refreshToken } = env.gmail;
    if (!clientId || !clientSecret || !refreshToken) {
      throw this._failure('missing_gmail_credentials', 'EMAIL_TRANSPORT is "gmail" but GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET or GMAIL_REFRESH_TOKEN is not set');
    }
    const raw = await new MailComposer({ from: env.emailFrom, to, subject, text, html, headers }).compile().build();
    this._diagnostic('attempt');
    const token = await this._gmailAccessToken();
    let res;
    try {
      res = await fetch(GMAIL_SEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ raw: raw.toString('base64url') }),
        signal: AbortSignal.timeout(env.emailTimeoutMs),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw this._failure('timeout', `Gmail did not respond within ${env.emailTimeoutMs} ms`);
      throw this._failure('network_error', 'Unable to reach Gmail over HTTPS');
    }
    if (!res.ok) {
      if (res.status === 401) this._gmailToken = null; // try a fresh token next time
      const reason = res.status === 403 ? 'gmail_permission' : res.status === 429 ? 'quota_exceeded' : res.status === 401 ? 'gmail_auth_failed' : 'provider_rejected';
      throw this._failure(reason, `Gmail rejected the email (HTTP ${res.status})`, res.status);
    }
    const data = await res.json().catch(() => ({}));
    this._diagnostic('accepted');
    return { accepted: [to], messageId: data.id || 'gmail' };
  }

  _sendMessage(to, subject, content) {
    const { email, unsubscribeUrl } = typeof to === 'string' ? { email: to } : to;
    return this.send({ to: email, subject, unsubscribeUrl, ...buildEmail({ appUrl: env.emailAppUrl, ...content, unsubscribeUrl }) });
  }

  _appLink(path) {
    return new URL(path, env.emailAppUrl).href;
  }

  sendOtpEmail(to, code, purpose, firstName) {
    const purposeLabel =
      purpose === 'login_mfa' ? 'Login verification' : purpose === 'email_verification' ? 'Email verification'
        : purpose === 'email_mfa_setup' ? 'Email two-factor setup' : purpose === 'email_mfa_settings' ? 'Security settings verification'
          : purpose === 'notification_confirmation' ? 'Email notification confirmation' : 'Password reset';
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

  /** Sent when a landlord approves a reservation: where, when, and who to contact to arrange the move-in. */
  sendCaretakerInvitationEmail(to, fullName, code, landlordName) {
    return this._sendMessage(to, 'Ledger OnBoard Caretaker Invitation', {
      category: 'Caretaker invitation', title: "You're invited to join", greeting: `Hi ${fullName},`,
      paragraphs: [`${landlordName || 'Your landlord'} invited you to become a caretaker on Ledger OnBoard.`,
        'Click the button below and you will be directed to the page. Once there, click "Activate a caretaker account" below the login button and use the activation code below, together with this email address, to choose your own password.'],
      highlight: { label: 'Your activation code', value: code },
      details: [['Invitation expires', 'In 3 days']],
      action: { label: 'Go to Ledger OnBoard', url: this._appLink('/login') },
      note: 'This code works once. If the invitation was unexpected, ignore it. Your landlord can issue a new code if needed.',
    });
  }

  sendSecurityNoticeEmail(to, fullName, event) {
    const title = event === 'mfa_disabled' ? 'Two-factor sign-in was turned off' : 'Your password was changed';
    return this._sendMessage(to, `Ledger OnBoard — ${title}`, {
      category: 'Account security', title, greeting: fullName ? `Hi ${fullName},` : 'Hello,',
      paragraphs: [`${title} on your Ledger OnBoard account.`, 'If you made this change, no action is needed.'],
      action: { label: 'Open Ledger OnBoard', url: this._appLink('/') },
      note: 'If you did not make this change, use password recovery or contact an administrator immediately.',
    });
  }

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

  /** Email copy of an in-app notification. */
  sendNotificationEmail(to, fullName, { title, message, link }) {
    return this._sendMessage(to, `Ledger OnBoard — ${title}`, {
      category: 'Notification', title, greeting: fullName ? `Hi ${fullName},` : 'Hello,',
      paragraphs: [message],
      action: { label: 'Open in Ledger OnBoard', url: this._appLink(link || '/') },
      note: 'You can turn off email notifications in Profile. In-app notifications stay on.',
    });
  }

  sendTestEmail(to, fullName) {
    return this._sendMessage(to, 'Ledger OnBoard — test email', {
      category: 'Email check', title: 'Email is working', greeting: fullName ? `Hi ${fullName},` : 'Hello,',
      paragraphs: ['This test was sent from the admin Profile page. If you can read it, Ledger OnBoard can send emails such as sign-up codes.'],
      action: { label: 'Open Ledger OnBoard', url: this._appLink('/') },
    });
  }

  /** An administrator moved the account to the Archive: blocked now, erased on deleteOn unless restored. */
  sendAccountClosedEmail(to, fullName, { reason, deleteOn, contactEmail }) {
    return this._sendMessage(to, 'Ledger OnBoard — Your account has been closed', {
      category: 'Account update', title: 'Your account has been closed', greeting: fullName ? `Hi ${fullName},` : 'Hello,',
      paragraphs: [
        'An administrator closed your Ledger OnBoard account, so you can no longer sign in.',
        `It will be permanently deleted on ${deleteOn}. Until then it can still be restored. If you think this is a mistake, contact ${contactEmail}.`,
      ],
      details: [['Reason', reason || 'Not specified'], ['Permanent deletion', deleteOn]],
      note: 'When an account is deleted, your personal details are erased. Records such as bills and payments stay with the other party, shown as "Deleted user".',
    });
  }

  /** Sent just before the personal details are erased (by the main admin, or when the 30 days end). */
  sendAccountDeletedEmail(to, fullName, { contactEmail }) {
    return this._sendMessage(to, 'Ledger OnBoard — Your account has been deleted', {
      category: 'Account update', title: 'Your account has been deleted', greeting: fullName ? `Hi ${fullName},` : 'Hello,',
      paragraphs: [
        'Your Ledger OnBoard account and your personal details have now been permanently deleted. This cannot be undone.',
        `You can create a new account with this email address at any time. Questions? Contact ${contactEmail}.`,
      ],
      action: { label: 'Create a new account', url: this._appLink('/register') },
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
