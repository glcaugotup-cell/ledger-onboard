const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const EmailService = require('./EmailService');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateOtp, hashOtp, compareOtp } = require('../utils/otp');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');
const { sanitizeUser } = require('../utils/sanitize');
const { deriveFullName } = require('../utils/name');
const { ROLES, ACCOUNT_STATUS } = require('../utils/constants');
const env = require('../config/env');

const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 45;
const PUBLIC_REGISTRATION_ROLES = new Set([ROLES.TENANT, ROLES.LANDLORD]);

/**
 * Registration, login (with optional email-OTP MFA), logout, password reset,
 * token refresh, and landlord-initiated caretaker creation/activation.
 * Public self-registration is limited to the tenant and landlord roles.
 */
class AuthService {
  async register({ firstName, lastName, email, password, phone, role, emergencyContact }) {
    if (!PUBLIC_REGISTRATION_ROLES.has(role)) {
      // Caretakers are created by landlords; admins are provisioned separately.
      throw ApiError.forbidden('This role cannot self-register', 'ROLE_NOT_SELF_REGISTERABLE');
    }

    const existing = await UserRepository.findByEmail(email);
    if (existing) {
      if (existing.emailVerified) {
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
      emailVerified: false, // gated behind OTP verification below — see login()'s emailVerified check
      lastActivityAt: new Date(),
      privacyConsent: { given: true, at: new Date() },
      emergencyContact: role === ROLES.TENANT ? emergencyContact : undefined,
    });

    // Reload with secrets selected so _issueOtp can write otp.* on it directly.
    const withSecrets = await UserRepository.findByEmail(email, { withSecrets: true });
    await this._issueOtp(withSecrets, 'email_verification');

    return sanitizeUser(user);
  }

  async verifyRegistrationOtp({ email, code }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (!user) throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');
    if (user.emailVerified) throw ApiError.conflict('This account is already verified', 'ALREADY_VERIFIED');

    await this._consumeOtp(user, code, 'email_verification');
    await UserRepository.updateById(user._id, { emailVerified: true });

    return { message: 'Email verified. You can now log in.' };
  }

  async resendRegistrationOtp({ email }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    // Generic response: don't reveal whether the account exists.
    if (!user || user.emailVerified) {
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
   */
  async cancelRegistration({ email }) {
    const user = await UserRepository.findByEmail(email);
    if (user && !user.emailVerified) {
      await UserRepository.deleteById(user._id);
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
    // Intentionally distinguishes "email not registered" from "wrong password"
    // for clearer login feedback.
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (!user) throw ApiError.unauthorized('This email is not registered.', 'EMAIL_NOT_REGISTERED');

    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) throw ApiError.unauthorized('Incorrect password.', 'INCORRECT_PASSWORD');

    this._assertLoginableStatus(user);

    if (!user.emailVerified) {
      throw ApiError.forbidden('Please verify your email address before logging in.', 'EMAIL_NOT_VERIFIED');
    }

    if (user.mfaEnabled && user.mfaMethod === 'email') {
      await this._issueOtp(user, 'login_mfa');
      return { mfaRequired: true, email: user.email };
    }

    return this._finalizeLogin(user);
  }

  async verifyLoginOtp({ email, code }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (!user) throw ApiError.unauthorized('Invalid or expired code', 'INVALID_OTP');

    this._assertLoginableStatus(user);
    await this._consumeOtp(user, code, 'login_mfa');

    return this._finalizeLogin(user);
  }

  async _finalizeLogin(user) {
    const now = new Date();
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await UserRepository.updateById(user._id, {
      lastLoginAt: now,
      lastActivityAt: now,
      refreshTokenHash,
      archiveWarningSentAt: null,
      scheduledArchiveAt: null,
    });

    return { user: sanitizeUser(user), accessToken, refreshToken };
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
      throw ApiError.forbidden('This account has not been activated yet. Check your email for the activation link.', 'ACCOUNT_PENDING_ACTIVATION');
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
    if (!user || user.refreshTokenHash !== tokenHash) {
      throw ApiError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
    }
    this._assertLoginableStatus(user);

    return this._finalizeLogin(user);
  }

  // ── Forgot / reset password ──────────────────────────────────────────
  // Never confirm or deny whether an email is registered.

  async forgotPassword({ email }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (user && user.accountStatus !== ACCOUNT_STATUS.ARCHIVED) {
      await this._issueOtp(user, 'password_reset');
    }
    return { message: 'If an account with that email exists, a verification code has been sent.' };
  }

  async resetPassword({ email, code, newPassword }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (!user) throw ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');

    await this._consumeOtp(user, code, 'password_reset');

    const passwordHash = await hashPassword(newPassword);
    await UserRepository.updateById(user._id, { passwordHash, refreshTokenHash: null });
    return { message: 'Password has been reset. You can now log in.' };
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await UserRepository.findByIdWithSecrets(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) throw ApiError.badRequest('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');

    const passwordHash = await hashPassword(newPassword);
    await UserRepository.updateById(userId, { passwordHash, refreshTokenHash: null });
    return { message: 'Password updated. Please log in again.' };
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
      await EmailService.sendOtpEmail(user.email, code, purpose, user.firstName);
    } catch (err) {
      // Log the real cause server-side; return only a generic message to the client.
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

  /** Turns email-OTP MFA on or off for the user's own account. */
  async setMfaPreference(userId, { enabled }) {
    const updates = enabled ? { mfaEnabled: true, mfaMethod: 'email' } : { mfaEnabled: false, mfaMethod: 'none' };
    const updated = await UserRepository.updateById(userId, updates);
    if (!updated) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    return sanitizeUser(updated);
  }

  /** Whitelisted self-edit: email, role, status and lifecycle fields are never client-editable. */
  async updateProfile(userId, updates) {
    const allowed = ['firstName', 'lastName', 'phone', 'profilePhotoUrl', 'notificationPreferences'];
    const safeUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    // findByIdAndUpdate skips document middleware, so keep the derived fullName in sync here.
    if (safeUpdates.firstName !== undefined || safeUpdates.lastName !== undefined) {
      const current = await UserRepository.findById(userId);
      if (!current) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
      safeUpdates.fullName = deriveFullName(
        safeUpdates.firstName !== undefined ? safeUpdates.firstName : current.firstName,
        safeUpdates.lastName !== undefined ? safeUpdates.lastName : current.lastName
      );
    }

    const updated = await UserRepository.updateById(userId, safeUpdates);
    if (!updated) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    return sanitizeUser(updated);
  }

  /** Self-service account closure. Never hard-deletes: marks the account deactivated and keeps its history. */
  async deactivateOwnAccount(userId) {
    await UserRepository.updateById(userId, { accountStatus: ACCOUNT_STATUS.DEACTIVATED, refreshTokenHash: null });
    return { message: 'Your account has been deactivated.' };
  }

  // ── Landlord-initiated caretaker creation & activation ──

  async createCaretaker(landlordId, { firstName, lastName, email, phone }) {
    const existing = await UserRepository.findByEmail(email);
    if (existing) throw ApiError.conflict('An account with this email already exists', 'ACCOUNT_EXISTS');

    const landlord = await UserRepository.findById(landlordId);

    const placeholderHash = await hashPassword(crypto.randomBytes(24).toString('hex'));
    const caretaker = await UserRepository.create({
      firstName,
      lastName,
      fullName: deriveFullName(firstName, lastName),
      email,
      phone,
      passwordHash: placeholderHash,
      role: ROLES.CARETAKER,
      assignedLandlordId: landlordId,
      createdByLandlordId: landlordId,
      accountStatus: ACCOUNT_STATUS.PENDING_ACTIVATION,
    });

    const activationToken = jwt.sign({ sub: String(caretaker._id), purpose: 'caretaker_activation' }, env.jwtSecret, {
      expiresIn: '3d',
    });
    const activationUrl = `${env.clientOrigin}/activate-caretaker?token=${activationToken}`;

    try {
      // eslint-disable-next-line no-console
      console.log(`[EmailService] Sending caretaker activation email\nTo: ${caretaker.email}\nSubject: Ledger OnBoard Caretaker Invitation`);
      await EmailService.sendCaretakerActivationEmail(caretaker.email, caretaker.fullName, activationUrl, landlord?.fullName);
      // eslint-disable-next-line no-console
      console.log('[EmailService] Caretaker activation email sent successfully');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[EmailService] Caretaker activation email failed:', err.message);
      // Roll back the new account so the landlord can safely retry the invitation.
      await UserRepository.deleteById(caretaker._id);
      throw ApiError.badRequest('Could not send the caretaker activation email. Please try again.', 'CARETAKER_EMAIL_DELIVERY_FAILED');
    }

    await AuditLogRepository.record({
      action: 'CARETAKER_CREATED',
      actorId: landlordId,
      actorRole: ROLES.LANDLORD,
      targetType: 'User',
      targetId: caretaker._id,
      metadata: { email: caretaker.email },
    });

    return sanitizeUser(caretaker);
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
    const allowed = ['firstName', 'lastName', 'phone'];
    const safeUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }
    if (safeUpdates.firstName !== undefined || safeUpdates.lastName !== undefined) {
      safeUpdates.fullName = deriveFullName(
        safeUpdates.firstName !== undefined ? safeUpdates.firstName : caretaker.firstName,
        safeUpdates.lastName !== undefined ? safeUpdates.lastName : caretaker.lastName
      );
    }
    const updated = await UserRepository.updateById(caretakerId, safeUpdates);
    return sanitizeUser(updated);
  }

  async activateCaretakerAccount({ token, password }) {
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw ApiError.badRequest('Invalid or expired activation link', 'INVALID_ACTIVATION_TOKEN');
    }
    if (payload.purpose !== 'caretaker_activation') {
      throw ApiError.badRequest('Invalid activation link', 'INVALID_ACTIVATION_TOKEN');
    }

    const user = await UserRepository.findById(payload.sub);
    if (!user || user.role !== ROLES.CARETAKER) {
      throw ApiError.badRequest('Invalid activation link', 'INVALID_ACTIVATION_TOKEN');
    }
    if (user.accountStatus !== ACCOUNT_STATUS.PENDING_ACTIVATION) {
      throw ApiError.conflict('This account has already been activated', 'ALREADY_ACTIVATED');
    }

    const passwordHash = await hashPassword(password);
    await UserRepository.updateById(user._id, {
      passwordHash,
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      lastActivityAt: new Date(),
    });

    return { message: 'Account activated. You can now log in.' };
  }
}

module.exports = new AuthService();
