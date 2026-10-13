const crypto = require('crypto');

const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const EmailService = require('./EmailService');
const EmailNotificationService = require('./EmailNotificationService');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword, unusablePasswordHash } = require('../utils/password');
const { generateOtp, hashOtp, compareOtp } = require('../utils/otp');
const { randomCode, normalizeCode } = require('../utils/oneTimeCodes');
const { signAccessToken, signRefreshToken, verifyRefreshToken, signMfaChallengeToken, verifyMfaChallengeToken, tokenVersionOf } = require('../utils/jwt');
const MfaService = require('./MfaService');
const ResetCodeService = require('./ResetCodeService');
const EmailOtpService = require('./EmailOtpService');
const AccountLifecycleService = require('./AccountLifecycleService');
const { sanitizeUser } = require('../utils/sanitize');
const { deriveFullName } = require('../utils/name');
const { ROLES, ACCOUNT_STATUS, RESERVATION_STATUS, CARETAKER_ACTIVATION_CODE } = require('../utils/constants');
const env = require('../config/env');

const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 45;

const FORGOT_PASSWORD_MESSAGE = 'To reset your password, use a code from your authenticator app or one of your backup codes. '
  + 'If you have neither, ask an administrator for a reset code.';
const invalidActivationCode = () => ApiError.badRequest('Invalid or expired activation code', 'INVALID_ACTIVATION_CODE');
const PUBLIC_REGISTRATION_ROLES = new Set([ROLES.TENANT, ROLES.LANDLORD]);

// Per-account (by email) failed-login lockout: 10 wrong email/password
// attempts in a row locks that account out for 30s, regardless of IP. This
// is separate from — and, for /login specifically, replaces — the IP-wide
// authRateLimiter window (see middleware/rateLimit.js).
const LOGIN_LOCKOUT_MAX_ATTEMPTS = 10;
const LOGIN_LOCKOUT_SECONDS = 30;
const loginAttemptsByEmail = new Map();

/**
 * Registration, login (with optional authenticator-app two-factor), logout, password reset,
 * token refresh, and landlord-initiated caretaker creation/activation.
 * Public self-registration is limited to the tenant and landlord roles.
 */
class AuthService {
  async register({ firstName, lastName, email, password, phone, role, emergencyContact }) {
    if (!PUBLIC_REGISTRATION_ROLES.has(role)) {
      // Caretakers are created by landlords; admins are provisioned separately.
      throw ApiError.forbidden('This role cannot self-register', 'ROLE_NOT_SELF_REGISTERABLE');
    }

    const verificationRequired = env.emailVerificationRequired;
    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      // With verification off, a pending (unverified) account can already sign in, so it gets the
      // same answer as any registered email and nothing is sent.
      if (existing.emailVerified || !verificationRequired) {
        throw ApiError.conflict('This email is already registered. Please log in instead.', 'ACCOUNT_EXISTS');
      }
      // An unverified registration already exists: resend a code and let the
      // client resume verification instead of creating a duplicate account.
      const withSecrets = await UserRepository.findByEmail(email, { withSecrets: true });
      try {
        this._assertResendCooldown(withSecrets);
        await this._issueOtp(withSecrets, 'email_verification');
      } catch (err) {
        if (err.code !== 'OTP_RESEND_COOLDOWN') throw err; // a real send failure must still surface
      }
      throw ApiError.conflict(
        'This email already has a pending verification. Enter the code we sent, or cancel and start over.',
        'ACCOUNT_PENDING_VERIFICATION',
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await UserRepository.create({
      firstName,
      lastName,
      fullName: deriveFullName(firstName, lastName),
      email,
      phone,
      passwordHash,
      role,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      // With verification on, gated behind the OTP below — see login()'s emailVerified check.
      emailVerified: !verificationRequired,
      lastActivityAt: new Date(),
      privacyConsent: { given: true, at: new Date() },
      emergencyContact: role === ROLES.TENANT ? emergencyContact : undefined,
    });

    if (verificationRequired) {
      // Reload with secrets selected so _issueOtp can write otp.* on it directly.
      const withSecrets = await UserRepository.findByEmail(email, { withSecrets: true });
      await this._issueOtp(withSecrets, 'email_verification');
    }

    return { user: sanitizeUser(user), verificationRequired };
  }

  async verifyRegistrationOtp({ email, code }) {
    // With verification off there is nothing to verify; answer every email the same way.
    if (!env.emailVerificationRequired) throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');

    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (!user) throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');
    if (user.emailVerified) throw ApiError.conflict('This account is already verified', 'ALREADY_VERIFIED');

    await this._consumeOtp(user, code, 'email_verification');
    await UserRepository.updateById(user._id, { emailVerified: true, emailConfirmedAt: new Date(), 'notificationPreferences.email': true });

    return { message: 'Email verified. You can now log in.' };
  }

  async resendRegistrationOtp({ email }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    // Generic response: don't reveal whether the account exists. With verification off, nothing is ever sent.
    if (!user || user.emailVerified || !env.emailVerificationRequired) {
      return { message: 'If a matching pending registration exists, a new code has been sent.' };
    }

    this._assertResendCooldown(user);
    await this._issueOtp(user, 'email_verification');
    return { message: 'A new verification code has been sent.' };
  }

  /**
   * Cancels a registration that is still awaiting email verification by
   * deleting the unverified User, which frees the email and invalidates the
   * pending OTP. Verified accounts are never deleted here, and the response
   * is the same either way so it doesn't reveal whether the account exists.
   * With verification off, nothing is ever deleted: a pending account can sign in
   * and may already have history (reservations, payments).
   */
  async cancelRegistration({ email }) {
    if (env.emailVerificationRequired) {
      const user = await UserRepository.findByEmail(email);
      if (user && !user.emailVerified) {
        await UserRepository.deleteById(user._id);
      }
    }
    return { message: 'Registration cancelled. You can register again with the correct information.' };
  }

  /** The OTP issue time is derived from expiresAt (always now + otpTtlMinutes). */
  _assertResendCooldown(user) {
    if (!user.otp?.expiresAt) return;
    const issuedAtMs = user.otp.expiresAt.getTime() - env.otpTtlMinutes * 60 * 1000;
    const elapsedMs = Date.now() - issuedAtMs;
    if (elapsedMs < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const retryAfterSeconds = Math.ceil((OTP_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000);
      throw ApiError.tooManyRequests(`Please wait ${retryAfterSeconds}s before requesting a new code.`, 'OTP_RESEND_COOLDOWN', { retryAfterSeconds });
    }
  }

  async login({ email, password }) {
    this._checkLoginLockout(email);

    // Intentionally distinguishes "email not registered" from "wrong password"
    // for clearer login feedback.
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (!user) {
      this._recordFailedLogin(email);
      throw ApiError.unauthorized('This email is not registered.', 'EMAIL_NOT_REGISTERED');
    }

    const valid = await comparePassword(password, user.passwordHash);
    // A caretaker who hasn't activated gets exactly the wrong-password answer, whatever they type:
    // accounts invited before phase 5 still have the old shared password saved.
    if (!valid || user.accountStatus === ACCOUNT_STATUS.PENDING_ACTIVATION) {
      this._recordFailedLogin(email);
      throw ApiError.unauthorized('Incorrect password.', 'INCORRECT_PASSWORD');
    }

    this._clearLoginAttempts(email);
    this._assertLoginableStatus(user);

    // With verification off, accounts still pending from before can sign in (phase 6 cleans up their data).
    if (!user.emailVerified && env.emailVerificationRequired) {
      throw ApiError.forbidden('Please verify your email address before logging in.', 'EMAIL_NOT_VERIFIED');
    }

    // Authenticator-app two-factor: the password alone earns only a 5-minute challenge token.
    // Two-factor switched on without an authenticator secret (the retired email method) counts
    // as not enrolled, so those accounts sign in with just their password.
    if (MfaService.isEnrolled(user)) {
      return { mfaRequired: true, challengeToken: signMfaChallengeToken(user) };
    }
    if (EmailOtpService.isEnrolled(user)) {
      const challengeToken = signMfaChallengeToken(user);
      await EmailOtpService.issue(user, 'login', challengeToken);
      return { mfaRequired: true, mfaMethod: 'email', challengeToken, resendAfterSeconds: 45 };
    }

    return this._finalizeLogin(user);
  }

  /** Second sign-in step: the challenge token from login() plus an authenticator or backup code. */
  async verifyLoginOtp({ challengeToken, code }) {
    const sessionExpired = () => ApiError.unauthorized('Your sign-in has expired. Please sign in again.', 'MFA_CHALLENGE_INVALID');
    let payload;
    try {
      payload = verifyMfaChallengeToken(challengeToken);
    } catch {
      throw sessionExpired();
    }

    const user = await UserRepository.findByIdWithSecrets(payload.sub);
    if (!user) throw sessionExpired();
    this._assertLoginableStatus(user);
    // Two-factor turned off in the meantime: start over rather than accept a code for nothing.
    if (tokenVersionOf(payload.tv) !== tokenVersionOf(user.tokenVersion)) throw sessionExpired();
    if (EmailOtpService.isEnrolled(user)) {
      if (!(await EmailOtpService.consume(user, 'login', code, { context: challengeToken }))) throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');
    } else {
      if (!MfaService.isEnrolled(user)) throw sessionExpired();
      await MfaService.verifyCode(user, code);
    }
    return this._finalizeLogin(user);
  }

  async resendLoginEmail({ challengeToken }) {
    let payload;
    try { payload = verifyMfaChallengeToken(challengeToken); } catch {
      throw ApiError.unauthorized('Your sign-in has expired. Please sign in again.', 'MFA_CHALLENGE_INVALID');
    }
    const user = await UserRepository.findByIdWithSecrets(payload.sub);
    if (!user || !EmailOtpService.isEnrolled(user) || tokenVersionOf(payload.tv) !== tokenVersionOf(user.tokenVersion)
      || user.emailCodes?.login?.context !== challengeToken) {
      throw ApiError.unauthorized('Your sign-in has expired. Please sign in again.', 'MFA_CHALLENGE_INVALID');
    }
    this._assertLoginableStatus(user);
    return EmailOtpService.issue(user, 'login', challengeToken);
  }

  /** New access and refresh tokens at the account's current session version; only this refresh token stays valid. */
  async _issueTokens(user, extraUpdates = {}) {
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await UserRepository.updateById(user._id, { refreshTokenHash, ...extraUpdates });
    return { accessToken, refreshToken };
  }

  async _finalizeLogin(user) {
    const now = new Date();
    const { accessToken, refreshToken } = await this._issueTokens(user, {
      lastLoginAt: now,
      lastActivityAt: now,
      archiveWarningSentAt: null,
      scheduledArchiveAt: null,
    });

    if (user.role === ROLES.TENANT) {
      // Fire-and-forget: any bill due-date reminder the daily job missed is sent on sign-in.
      require('./BillingReminderService')
        .runForTenant(user._id)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[AuthService] bill reminder check failed:', err.message);
        });
    }

    return { user: sanitizeUser(user), accessToken, refreshToken };
  }

  _checkLoginLockout(email) {
    const entry = loginAttemptsByEmail.get(email.toLowerCase());
    if (!entry?.lockedUntil || entry.lockedUntil <= Date.now()) return;

    const retryAfterSeconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    throw ApiError.tooManyRequests(
      `Too many failed login attempts. Try again in ${retryAfterSeconds}s.`,
      'LOGIN_LOCKED',
      { retryAfterSeconds },
    );
  }

  _recordFailedLogin(email) {
    const key = email.toLowerCase();
    const entry = loginAttemptsByEmail.get(key) || { count: 0, lockedUntil: null };
    entry.count += 1;
    if (entry.count >= LOGIN_LOCKOUT_MAX_ATTEMPTS) {
      entry.lockedUntil = Date.now() + LOGIN_LOCKOUT_SECONDS * 1000;
      entry.count = 0;
    }
    loginAttemptsByEmail.set(key, entry);
  }

  _clearLoginAttempts(email) {
    loginAttemptsByEmail.delete(email.toLowerCase());
  }

  _assertLoginableStatus(user) {
    if (user.accountStatus === ACCOUNT_STATUS.ARCHIVED) {
      throw ApiError.forbidden('This account has been archived due to inactivity. Use account recovery to reactivate.', 'ACCOUNT_ARCHIVED');
    }
    if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
      throw ApiError.forbidden('This account has been suspended. Contact support.', 'ACCOUNT_SUSPENDED');
    }
    if (user.accountStatus === ACCOUNT_STATUS.DEACTIVATED) {
      throw ApiError.forbidden('This account has been deactivated.', 'ACCOUNT_DEACTIVATED');
    }
    if (user.accountStatus === ACCOUNT_STATUS.PENDING_ACTIVATION) {
      throw ApiError.forbidden('This account has not been activated yet. Ask your landlord for an activation code.', 'ACCOUNT_PENDING_ACTIVATION');
    }
  }

  async logout(userId) {
    await UserRepository.updateById(userId, { refreshTokenHash: null });
    return { loggedOut: true };
  }

  async refreshAccessToken(refreshToken) {
    if (!refreshToken) throw ApiError.unauthorized('Refresh token required', 'MISSING_REFRESH_TOKEN');

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }

    const user = await UserRepository.findByIdWithSecrets(payload.sub);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    // A raised session version (password reset or change, suspension...) ends this session too.
    if (!user || user.refreshTokenHash !== tokenHash || tokenVersionOf(payload.tv) !== tokenVersionOf(user.tokenVersion)) {
      throw ApiError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }
    this._assertLoginableStatus(user);

    return this._finalizeLogin(user);
  }

  // ── Forgot / reset password ──────────────────────────────────────────
  // Never confirm or deny whether an email is registered.

  /** Nothing is looked up or sent: the same instructions for every email. */
  async forgotPassword({ email } = {}) {
    if (env.emailAccountFlowsEnabled) {
      const user = email ? await UserRepository.findByEmail(email, { withSecrets: true }) : null;
      if (user && user.emailVerified && user.accountStatus !== ACCOUNT_STATUS.PENDING_ACTIVATION) {
        try { await EmailOtpService.issue(user, 'reset'); } catch {
          // Always the same response, including cooldowns and provider outages.
          console.warn('[AuthService] Password reset email was not sent.');
        }
      }
      return { message: 'If an eligible account matches that email, a reset code has been sent. You can also use your authenticator, backup or administrator reset code.' };
    }
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  /**
   * Resets a password with an admin reset code, an authenticator code or a backup code
   * (ResetCodeService). No password is needed, so failures use their own counter
   * (passwordReset.*) and never touch the sign-in code lock, which in turn never blocks a reset.
   * Unknown emails get the same generic error. An archived account is also restored, exactly as
   * account recovery would; suspended and deactivated accounts keep their status.
   */
  async resetPassword({ email, code, newPassword }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (!user) throw ResetCodeService.invalidCode();
    ResetCodeService.assertNotLocked(user, 'passwordReset');

    const method = await ResetCodeService.match(user, code);
    if (!method) {
      await ResetCodeService.recordFailure(user, 'passwordReset');
      throw ResetCodeService.invalidCode();
    }

    const archived = user.accountStatus === ACCOUNT_STATUS.ARCHIVED;
    const passwordHash = await hashPassword(newPassword);
    // Signs every device out and signs no one in: the person goes to the sign-in page.
    await UserRepository.updateById(user._id, {
      ...ResetCodeService.newPasswordUpdate(passwordHash, 'passwordReset'),
      ...(archived ? AccountLifecycleService.restoredFields() : {}),
    });
    await AuditLogRepository.record({ action: 'PASSWORD_RESET', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id, metadata: { method } });
    if (archived) await AccountLifecycleService.recordRecovery(user, method);
    await EmailNotificationService.securityNotice(user, 'password_changed');
    return { message: 'Password has been reset. You can now log in.' };
  }

  /**
   * Signed-in password change: the current password, plus an authenticator or backup code when
   * two-factor is on. Every other device is signed out (session version up); this device gets
   * fresh tokens in the response and stays signed in.
   */
  async changePassword(userId, { currentPassword, newPassword, code }) {
    const user = await UserRepository.findByIdWithSecrets(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) throw ApiError.badRequest('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
    // Checked only after the password, so the code counter can't be moved without it.
    if (MfaService.isEnrolled(user)) await MfaService.verifyCode(user, code);
    if (EmailOtpService.isEnrolled(user) && !(await EmailOtpService.consume(user, 'settings', code))) throw ResetCodeService.invalidCode();

    const passwordHash = await hashPassword(newPassword);
    const updated = await UserRepository.updateById(userId, { passwordHash, $inc: { tokenVersion: 1 } });
    const { accessToken, refreshToken } = await this._issueTokens(updated);
    await AuditLogRepository.record({ action: 'PASSWORD_CHANGED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id });
    await EmailNotificationService.securityNotice(user, 'password_changed');
    return { message: 'Password updated. Other devices have been signed out.', user: sanitizeUser(updated), accessToken, refreshToken };
  }

  // ── OTP plumbing (shared by login-MFA and password reset) ───────────

  async _issueOtp(user, purpose) {
    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + env.otpTtlMinutes * 60 * 1000);

    await UserRepository.updateById(user._id, {
      otp: { codeHash, purpose, expiresAt, attempts: 0 },
    });

    try {
      const delivery = await EmailService.sendOtpEmail(user.email, code, purpose, user.firstName);
      if (delivery?.skipped) throw new Error('Verification email was skipped; check EMAIL_TRANSPORT');
    } catch (err) {
      // Log the real cause server-side; return only a generic message to the client.
      await UserRepository.model.updateOne({ _id: user._id, 'otp.codeHash': codeHash }, {
        $set: { 'otp.codeHash': null, 'otp.expiresAt': null },
      }).exec();
      // eslint-disable-next-line no-console
      console.error('[AuthService] Failed to send OTP email:', err.message);
      throw ApiError.badRequest('Unable to send verification code. Please try again.', 'OTP_EMAIL_DELIVERY_FAILED');
    }
  }

  async _consumeOtp(user, code, expectedPurpose) {
    const otp = user.otp;
    if (!otp || !otp.codeHash || otp.purpose !== expectedPurpose) {
      throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');
    }
    if (otp.expiresAt && otp.expiresAt.getTime() < Date.now()) {
      await UserRepository.updateById(user._id, { otp: { codeHash: null, purpose: null, expiresAt: null, attempts: 0 } });
      throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');
    }
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw ApiError.tooManyRequests('Too many incorrect attempts. Request a new code.', 'OTP_ATTEMPTS_EXCEEDED');
    }

    const match = await compareOtp(code, otp.codeHash);
    if (!match) {
      await UserRepository.updateById(user._id, { 'otp.attempts': otp.attempts + 1 });
      throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');
    }

    await UserRepository.updateById(user._id, { otp: { codeHash: null, purpose: null, expiresAt: null, attempts: 0 } });
  }

  async getProfile(userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    return sanitizeUser(user);
  }

  /**
   * Whitelisted self-edit. Name and email are the registered identity and are never
   * editable here (the validators reject them too), nor are role, status and lifecycle fields.
   */
  async updateProfile(userId, updates) {
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

    // Allow-list. Tenants, landlords and caretakers may also edit their name and emergency contact;
    // the admin profile is unchanged. Email, role, status and ownership are never accepted here.
    const allowed = ['phone', 'profilePhotoUrl', 'notificationPreferences'];
    if (user.role !== ROLES.ADMIN) allowed.push('firstName', 'lastName');
    const safeUpdates = {};
    if (updates.notificationPreferences?.email === true && !user.emailConfirmedAt) {
      throw ApiError.badRequest('Confirm your inbox before enabling email notifications.', 'EMAIL_CONFIRMATION_REQUIRED');
    }
    for (const key of allowed) {
      if (key === 'notificationPreferences') continue;
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }
    for (const key of ['email', 'inApp']) {
      if (typeof updates.notificationPreferences?.[key] === 'boolean') safeUpdates[`notificationPreferences.${key}`] = updates.notificationPreferences[key];
    }
    if (user.role !== ROLES.ADMIN && updates.emergencyContact && typeof updates.emergencyContact === 'object') {
      if (updates.emergencyContact.name !== undefined) safeUpdates['emergencyContact.name'] = updates.emergencyContact.name;
      if (updates.emergencyContact.phone !== undefined) safeUpdates['emergencyContact.phone'] = updates.emergencyContact.phone;
    }
    if (safeUpdates.firstName !== undefined || safeUpdates.lastName !== undefined) {
      safeUpdates.fullName = deriveFullName(safeUpdates.firstName ?? user.firstName, safeUpdates.lastName ?? user.lastName);
    }

    const updated = await UserRepository.updateById(userId, safeUpdates);
    if (!updated) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    return sanitizeUser(updated);
  }

  async requestNotificationEmail(userId, { password }) {
    const user = await UserRepository.findByIdWithSecrets(userId);
    if (!user || !(await comparePassword(password, user.passwordHash))) throw ApiError.badRequest('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
    return EmailOtpService.issue(user, 'notifications');
  }

  async confirmNotificationEmail(userId, { code }) {
    const user = await UserRepository.findByIdWithSecrets(userId);
    if (!user || !(await EmailOtpService.consume(user, 'notifications', code, { successUpdates: {
      emailConfirmedAt: new Date(), 'notificationPreferences.email': true,
    } }))) throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');
    return { user: sanitizeUser(await UserRepository.findById(userId)) };
  }

  /**
   * Self-service account closure ("Delete Account") for tenants, landlords and caretakers.
   * Never hard-deletes: the account is marked deactivated (login blocked) and every
   * reservation, bill, payment, review, reading, property and audit record stays linked to it.
   * A landlord's listings stop appearing in search while the account is closed (see
   * PropertyService), and closure is refused while tenants still depend on the landlord.
   */
  async deactivateOwnAccount(userId, reason) {
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
      throw ApiError.badRequest('Please provide a reason (3 to 500 characters).', 'REASON_REQUIRED');
    }
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    if (user.role === ROLES.ADMIN) {
      throw ApiError.forbidden('Admin accounts cannot be closed from the profile', 'CANNOT_CLOSE_ADMIN');
    }

    if (user.role === ROLES.LANDLORD) {
      // Required lazily: PropertyRepository/ReservationRepository aren't otherwise needed by auth.
      const PropertyRepository = require('../repositories/PropertyRepository');
      const ReservationRepository = require('../repositories/ReservationRepository');
      const properties = await PropertyRepository.findByLandlord(userId);
      const open = await ReservationRepository.count({
        propertyId: { $in: properties.map((p) => p._id) },
        status: { $in: [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.ACTIVE] },
      });
      if (open > 0) {
        throw ApiError.conflict(
          `You still have ${open} pending or current reservation${open === 1 ? '' : 's'}. Answer the pending requests and complete or cancel current tenancies before closing your account.`,
          'LANDLORD_HAS_OPEN_RESERVATIONS'
        );
      }
    }

    await UserRepository.updateById(userId, {
      accountStatus: ACCOUNT_STATUS.DEACTIVATED,
      statusReason: reason.trim(),
      statusChangedAt: new Date(),
      refreshTokenHash: null,
      $inc: { tokenVersion: 1 }, // ends every session
    });
    await AuditLogRepository.record({
      action: 'ACCOUNT_CLOSED_BY_OWNER',
      actorId: userId,
      actorRole: user.role,
      targetType: 'User',
      targetId: userId,
    });
    return { message: 'Your account has been closed.' };
  }

  // ── Landlord-initiated caretaker creation & activation ──

  async createCaretaker(landlordId, { firstName, lastName, email, phone, serviceBarangay }) {
    const existing = await UserRepository.findByEmail(email);
    if (existing) throw ApiError.conflict('An account with this email already exists', 'ACCOUNT_EXISTS');

    // No password is set: the account gets a hash nothing matches and stays pending until the
    // caretaker activates it with the code the landlord hands them. Nothing is emailed.
    const caretaker = await UserRepository.create({
      firstName,
      lastName,
      fullName: deriveFullName(firstName, lastName),
      email,
      phone,
      passwordHash: await unusablePasswordHash(),
      role: ROLES.CARETAKER,
      serviceBarangay,
      assignedLandlordId: landlordId,
      createdByLandlordId: landlordId,
      accountStatus: ACCOUNT_STATUS.PENDING_ACTIVATION,
    });
    const { code, expiresAt } = await this._issueActivationCode(caretaker._id);
    await this._emailCaretakerInvitation(caretaker, code, landlordId);

    await AuditLogRepository.record({
      action: 'CARETAKER_CREATED',
      actorId: landlordId,
      actorRole: ROLES.LANDLORD,
      targetType: 'User',
      targetId: caretaker._id,
      metadata: { email: caretaker.email, expiresAt },
    });

    return { caretaker: sanitizeUser(caretaker), activationCode: code, expiresAt };
  }

  /** A new activation code for a caretaker who hasn't activated yet; the previous code stops working. */
  async resendCaretakerInvitation(landlordId, caretakerId) {
    const caretaker = await UserRepository.findById(caretakerId);
    if (!caretaker || caretaker.role !== ROLES.CARETAKER || String(caretaker.assignedLandlordId) !== String(landlordId)) {
      throw ApiError.notFound('Caretaker not found', 'CARETAKER_NOT_FOUND');
    }
    if (caretaker.accountStatus !== ACCOUNT_STATUS.PENDING_ACTIVATION) {
      throw ApiError.conflict('This caretaker has already activated their account', 'ALREADY_ACTIVATED');
    }

    const { code, expiresAt } = await this._issueActivationCode(caretaker._id, { invitationResentAt: new Date() });
    await this._emailCaretakerInvitation(caretaker, code, landlordId);
    await AuditLogRepository.record({
      action: 'CARETAKER_INVITATION_RESENT',
      actorId: landlordId,
      actorRole: ROLES.LANDLORD,
      targetType: 'User',
      targetId: caretaker._id,
      metadata: { email: caretaker.email, expiresAt },
    });

    const updated = await UserRepository.findById(caretaker._id);
    return { caretaker: sanitizeUser(updated), activationCode: code, expiresAt };
  }

  async _emailCaretakerInvitation(caretaker, code, landlordId) {
    if (!env.emailAccountFlowsEnabled) return;
    try {
      const landlord = await UserRepository.findById(landlordId);
      await EmailService.sendCaretakerInvitationEmail(caretaker.email, caretaker.fullName, code, landlord?.fullName);
    } catch {
      console.warn('[AuthService] Caretaker invitation email was not sent; the landlord activation code is still valid.');
    }
  }

  /**
   * A 10-character code without look-alikes (XXXXX-XXXXX), valid 72 hours. Only its bcrypt hash is
   * stored, in the one-time-code slot, replacing anything there; the code itself is returned once,
   * to the landlord, and never logged or audited.
   */
  async _issueActivationCode(caretakerId, extraUpdates = {}) {
    const code = randomCode(CARETAKER_ACTIVATION_CODE.LENGTH, 5);
    const expiresAt = new Date(Date.now() + CARETAKER_ACTIVATION_CODE.TTL_HOURS * 60 * 60 * 1000);
    await UserRepository.updateById(caretakerId, {
      otp: { codeHash: await hashOtp(normalizeCode(code)), purpose: 'caretaker_activation', expiresAt, attempts: 0 },
      ...extraUpdates,
    });
    return { code, expiresAt };
  }

  async listCaretakersForLandlord(landlordId) {
    const caretakers = await UserRepository.findCaretakersByLandlord(landlordId);
    return caretakers.map(sanitizeUser);
  }

  async updateCaretaker(landlordId, caretakerId, updates) {
    const caretaker = await UserRepository.findById(caretakerId);
    if (!caretaker || String(caretaker.assignedLandlordId) !== String(landlordId)) {
      throw ApiError.notFound('Caretaker not found', 'CARETAKER_NOT_FOUND');
    }
    // The caretaker's name and email are their identity; the landlord can update contact number and service area.
    const allowed = ['phone', 'serviceBarangay'];
    const safeUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }
    const updated = await UserRepository.updateById(caretakerId, safeUpdates);
    return sanitizeUser(updated);
  }

  async removeCaretaker(landlordId, caretakerId, reason) {
    if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) {
      throw ApiError.badRequest('Please provide a reason (3 to 500 characters).', 'REASON_REQUIRED');
    }
    const caretaker = await UserRepository.findById(caretakerId);
    if (!caretaker || caretaker.role !== ROLES.CARETAKER || String(caretaker.assignedLandlordId) !== String(landlordId)) {
      throw ApiError.notFound('Caretaker not found', 'CARETAKER_NOT_FOUND');
    }
    await UserRepository.updateById(caretakerId, {
      accountStatus: ACCOUNT_STATUS.DEACTIVATED,
      statusReason: reason.trim(),
      statusChangedAt: new Date(),
      refreshTokenHash: null,
      $inc: { tokenVersion: 1 }, // ends every session
    });
    await AuditLogRepository.record({
      action: 'CARETAKER_REMOVED_BY_LANDLORD',
      actorId: landlordId,
      actorRole: ROLES.LANDLORD,
      targetType: 'User',
      targetId: caretakerId,
      metadata: { reason: reason.trim() },
    });
    return { removed: true };
  }

  /**
   * The caretaker's email, the code from their landlord and a new password. Unknown emails, other
   * roles, accounts that aren't pending and wrong or expired codes all get the same generic error.
   * The code works once: the update only applies while the same code hash is still in the slot.
   */
  async activateCaretakerAccount({ email, code, password }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    const otp = user?.otp;
    const usable = user
      && user.role === ROLES.CARETAKER
      && user.accountStatus === ACCOUNT_STATUS.PENDING_ACTIVATION
      && otp?.codeHash && otp.purpose === 'caretaker_activation'
      && otp.expiresAt && otp.expiresAt.getTime() >= Date.now();
    if (!usable || !(await compareOtp(normalizeCode(code), otp.codeHash))) throw invalidActivationCode();

    const now = new Date();
    const activated = await UserRepository.model.findOneAndUpdate(
      { _id: user._id, accountStatus: ACCOUNT_STATUS.PENDING_ACTIVATION, 'otp.codeHash': otp.codeHash },
      {
        $set: {
          passwordHash: await hashPassword(password),
          accountStatus: ACCOUNT_STATUS.ACTIVE,
          activatedAt: now,
          lastActivityAt: now,
          otp: { codeHash: null, purpose: null, expiresAt: null, attempts: 0 },
        },
      },
    ).exec();
    if (!activated) throw invalidActivationCode(); // the same code was used a moment ago

    await AuditLogRepository.record({ action: 'CARETAKER_ACTIVATED', actorId: user._id, actorRole: ROLES.CARETAKER, targetType: 'User', targetId: user._id });
    return { message: 'Account activated. You can now log in.' };
  }
}

module.exports = new AuthService();
