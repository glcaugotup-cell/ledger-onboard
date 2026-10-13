const crypto = require('crypto');

const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const ApiError = require('../utils/ApiError');
const { comparePassword } = require('../utils/password');
const { generateSecret, verifyTotp, buildOtpauthUri } = require('../utils/totp');
const { encryptSecret, decryptSecret } = require('../utils/secretCrypto');
const { randomCode, normalizeCode } = require('../utils/oneTimeCodes');
const { sanitizeUser } = require('../utils/sanitize');
const { MFA_METHOD } = require('../utils/constants');
const env = require('../config/env');
const EmailOtpService = require('./EmailOtpService');
const EmailNotificationService = require('./EmailNotificationService');

/** Shown in the authenticator app next to the code. */
const MFA_ISSUER = 'Ledger OnBoard';
const BACKUP_CODE_COUNT = 10;
// 10 characters without look-alikes (utils/oneTimeCodes.js): about 49 random bits, shown as XXXXX-XXXXX.
const BACKUP_CODE_LENGTH = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

// One answer for every wrong, reused or spent code, so none of them can be told apart.
const invalidCode = () => ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');

const CLEARED_TOTP_STATE = {
  'mfaTotp.secretEnc': null,
  'mfaTotp.pendingSecretEnc': null,
  'mfaTotp.lastUsedStep': null,
  'mfaTotp.backupCodeHashes': [],
  'mfaTotp.failedAttempts': 0,
  'mfaTotp.lockedUntil': null,
};

/**
 * Authenticator-app two-factor sign-in (TOTP): enrollment, code checks, backup codes,
 * lockout and replay protection. Nothing here is ever sent anywhere: the codes come
 * from the person's own phone.
 */
class MfaService {
  /** Two-factor counts only with a stored authenticator secret; the retired email method does not (3.7). */
  isEnrolled(user) {
    return Boolean(user?.mfaEnabled && user.mfaMethod === MFA_METHOD.TOTP && user.mfaTotp?.secretEnc);
  }

  /** Step 1: a new secret, held as pending until a code from the app confirms it. */
  async setup(userId, { password }) {
    const user = await this._loadWithPassword(userId, password);
    if (this.isEnrolled(user) || EmailOtpService.isEnrolled(user)) {
      throw ApiError.conflict('Two-factor sign-in is already on. Turn it off first to set it up again.', 'MFA_ALREADY_ENABLED');
    }
    const key = this._key();
    const secret = generateSecret();
    await UserRepository.updateById(user._id, { 'mfaTotp.pendingSecretEnc': encryptSecret(secret, key, this._context(user)) });
    return {
      otpauthUri: buildOtpauthUri({ secret, accountName: user.email, issuer: MFA_ISSUER }),
      secret, // for typing into the app by hand when the QR code can't be scanned
      issuer: MFA_ISSUER,
      accountName: user.email,
    };
  }

  /** Step 2: a correct code from the app turns two-factor on and returns the backup codes, once. */
  async enable(userId, { code }) {
    const user = await this._load(userId);
    if (this.isEnrolled(user) || EmailOtpService.isEnrolled(user)) {
      throw ApiError.conflict('Two-factor sign-in is already on.', 'MFA_ALREADY_ENABLED');
    }
    if (!user.mfaTotp?.pendingSecretEnc) {
      throw ApiError.badRequest('Start two-factor setup first.', 'MFA_SETUP_REQUIRED');
    }
    this._assertNotLocked(user);
    const secret = decryptSecret(user.mfaTotp.pendingSecretEnc, this._key(), this._context(user));
    const step = verifyTotp(secret, code);
    if (step === null) {
      await this._recordFailure(user);
      throw invalidCode();
    }

    const backupCodes = this._newBackupCodes();
    const updated = await UserRepository.model.findOneAndUpdate({ _id: user._id,
      emailMfaEnabledAt: null, 'mfaTotp.pendingSecretEnc': user.mfaTotp.pendingSecretEnc,
    }, { $set: {
      mfaEnabled: true,
      mfaMethod: MFA_METHOD.TOTP,
      'mfaTotp.secretEnc': user.mfaTotp.pendingSecretEnc,
      'mfaTotp.pendingSecretEnc': null,
      'mfaTotp.lastUsedStep': step,
      'mfaTotp.backupCodeHashes': backupCodes.map((c) => this._hashBackupCode(c)),
      'mfaTotp.failedAttempts': 0,
      'mfaTotp.lockedUntil': null,
    } }, { new: true }).exec();
    if (!updated) throw ApiError.conflict('Two-factor settings changed. Start again.', 'MFA_ALREADY_ENABLED');
    await AuditLogRepository.record({ action: 'MFA_ENABLED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id });
    return { backupCodes, user: sanitizeUser(updated) };
  }

  /** Needs the password and a current code (app or backup). Older email two-factor needs only the password. */
  async disable(userId, { password, code }) {
    const user = await this._loadWithPassword(userId, password);
    if (this.isEnrolled(user)) await this.verifyCode(user, code);
    if (EmailOtpService.isEnrolled(user) && !(await EmailOtpService.consume(user, 'settings', code))) throw invalidCode();
    const updated = await UserRepository.updateById(user._id, { mfaEnabled: false, mfaMethod: MFA_METHOD.NONE,
      emailMfaEnabledAt: null, emailCodes: {}, ...CLEARED_TOTP_STATE });
    await AuditLogRepository.record({ action: 'MFA_DISABLED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id });
    if (this.isEnrolled(user) || EmailOtpService.isEnrolled(user)) await EmailNotificationService.securityNotice(user, 'mfa_disabled');
    return { user: sanitizeUser(updated) };
  }

  async emailSetup(userId, { password }) {
    if (!env.emailMfaEnrollmentEnabled) throw new ApiError(410, 'EMAIL_MFA_ENROLLMENT_CLOSED', 'Use an authenticator app to set up two-factor sign-in.');
    const user = await this._loadWithPassword(userId, password);
    if (this.isEnrolled(user) || EmailOtpService.isEnrolled(user)) throw ApiError.conflict('Turn off your current two-factor method before choosing another.', 'MFA_ALREADY_ENABLED');
    return EmailOtpService.issue(user, 'setup');
  }

  async emailEnable(userId, { code }) {
    if (!env.emailMfaEnrollmentEnabled) throw new ApiError(410, 'EMAIL_MFA_ENROLLMENT_CLOSED', 'Use an authenticator app to set up two-factor sign-in.');
    EmailOtpService.assertAvailable();
    const user = await this._load(userId);
    if (this.isEnrolled(user) || EmailOtpService.isEnrolled(user)) throw ApiError.conflict('Two-factor sign-in is already on.', 'MFA_ALREADY_ENABLED');
    if (!(await EmailOtpService.consume(user, 'setup', code))) throw invalidCode();
    const updated = await UserRepository.model.findOneAndUpdate({ _id: user._id, emailMfaEnabledAt: null, 'mfaTotp.secretEnc': null },
      { $set: { mfaEnabled: true, mfaMethod: MFA_METHOD.EMAIL, emailMfaEnabledAt: new Date(), emailConfirmedAt: new Date(), ...CLEARED_TOTP_STATE } }, { new: true }).exec();
    if (!updated) throw ApiError.conflict('Two-factor settings changed. Start again.', 'MFA_ALREADY_ENABLED');
    await AuditLogRepository.record({ action: 'MFA_ENABLED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id, metadata: { method: 'email' } });
    return { user: sanitizeUser(updated) };
  }

  async emailSettingsCode(userId, { password }) {
    const user = await this._loadWithPassword(userId, password);
    if (!EmailOtpService.isEnrolled(user)) throw ApiError.badRequest('Email two-factor sign-in is not on.', 'MFA_NOT_ENABLED');
    return EmailOtpService.issue(user, 'settings');
  }

  /** Replaces every backup code; the old ones stop working. Returned once. */
  async regenerateBackupCodes(userId, { password, code }) {
    const user = await this._loadWithPassword(userId, password);
    if (!this.isEnrolled(user)) throw ApiError.badRequest('Two-factor sign-in is not on.', 'MFA_NOT_ENABLED');
    await this.verifyCode(user, code);
    const backupCodes = this._newBackupCodes();
    await UserRepository.updateById(user._id, { 'mfaTotp.backupCodeHashes': backupCodes.map((c) => this._hashBackupCode(c)) });
    await AuditLogRepository.record({ action: 'MFA_BACKUP_CODES_REGENERATED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id });
    return { backupCodes };
  }

  /**
   * Two-factor check for sign-in and account settings: accepts a current authenticator code or an
   * unused backup code. Uses the two-factor failure counter: five wrong codes lock code entry for
   * 15 minutes. Returns 'totp' or 'backup'.
   */
  async verifyCode(user, code) {
    this._assertNotLocked(user);
    const method = await this.consumeCode(user, code, { clearFailures: true });
    if (method) return method;
    await this._recordFailure(user);
    throw invalidCode();
  }

  /**
   * Checks and spends an authenticator code (never one already used) or a backup code (gone
   * once used), returning 'totp', 'backup' or null. It neither checks nor changes the two-factor
   * failure counter or lock, so callers with their own limits (password reset) stay separate.
   */
  async consumeCode(user, code, { clearFailures = false } = {}) {
    if (!this.isEnrolled(user)) return null;
    const candidate = String(code || '').trim();
    const onSuccess = clearFailures ? { 'mfaTotp.failedAttempts': 0 } : {};

    if (/^\d{6}$/.test(candidate)) {
      const secret = decryptSecret(user.mfaTotp.secretEnc, this._key(), this._context(user));
      const step = verifyTotp(secret, candidate);
      if (step === null) return null;
      // Atomic: only a step newer than the last accepted one is taken, so a code works once.
      const claimed = await UserRepository.model.findOneAndUpdate(
        { _id: user._id, $or: [{ 'mfaTotp.lastUsedStep': null }, { 'mfaTotp.lastUsedStep': { $lt: step } }] },
        { $set: { 'mfaTotp.lastUsedStep': step, ...onSuccess } },
      ).exec();
      return claimed ? 'totp' : null;
    }

    if (normalizeCode(candidate).length !== BACKUP_CODE_LENGTH) return null;
    const hash = this._hashBackupCode(candidate);
    // Atomic: the code is removed by the same update that accepts it, so it works once.
    const claimed = await UserRepository.model.findOneAndUpdate(
      { _id: user._id, 'mfaTotp.backupCodeHashes': hash },
      { $pull: { 'mfaTotp.backupCodeHashes': hash }, ...(clearFailures ? { $set: onSuccess } : {}) },
    ).exec();
    if (!claimed) return null;
    await AuditLogRepository.record({ action: 'MFA_BACKUP_CODE_USED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id });
    return 'backup';
  }

  // ── internals ──────────────────────────────────────────────────────────

  _key() {
    if (!env.mfaEncryptionKey) {
      throw new ApiError(503, 'MFA_NOT_CONFIGURED', 'Two-factor sign-in is not available on this server yet.');
    }
    return env.mfaEncryptionKey;
  }

  /** Binds each encrypted secret to its own account. */
  _context(user) {
    return `mfa:${user._id}`;
  }

  async _load(userId) {
    const user = await UserRepository.findByIdWithSecrets(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    return user;
  }

  async _loadWithPassword(userId, password) {
    const user = await this._load(userId);
    if (!(await comparePassword(password, user.passwordHash))) {
      throw ApiError.badRequest('Current password is incorrect', 'INVALID_CURRENT_PASSWORD');
    }
    return user;
  }

  _assertNotLocked(user) {
    const lockedUntil = user.mfaTotp?.lockedUntil;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
      throw ApiError.tooManyRequests('Too many incorrect attempts. Try again later.', 'OTP_ATTEMPTS_EXCEEDED', { retryAfterSeconds });
    }
  }

  async _recordFailure(user) {
    const updated = await UserRepository.model
      .findByIdAndUpdate(user._id, { $inc: { 'mfaTotp.failedAttempts': 1 } }, { new: true })
      .select('+mfaTotp.failedAttempts')
      .exec();
    if ((updated?.mfaTotp?.failedAttempts || 0) >= MAX_FAILED_ATTEMPTS) {
      await UserRepository.updateById(user._id, {
        'mfaTotp.failedAttempts': 0,
        'mfaTotp.lockedUntil': new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
      });
      await AuditLogRepository.record({ action: 'MFA_LOCKED', targetType: 'User', targetId: user._id, metadata: { minutes: LOCK_MINUTES } });
    }
  }

  _newBackupCodes() {
    return Array.from({ length: BACKUP_CODE_COUNT }, () => randomCode(BACKUP_CODE_LENGTH, 5));
  }

  /** Keyed hash (the encryption key is the pepper), so a database copy alone can't be brute-forced offline. */
  _hashBackupCode(code) {
    return crypto.createHmac('sha256', this._key()).update(`backup-code:${normalizeCode(code)}`).digest('hex');
  }
}

module.exports = new MfaService();
module.exports.MFA_ISSUER = MFA_ISSUER;
module.exports.BACKUP_CODE_COUNT = BACKUP_CODE_COUNT;
