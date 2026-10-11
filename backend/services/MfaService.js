const crypto = require('crypto');

const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const ApiError = require('../utils/ApiError');
const { comparePassword } = require('../utils/password');
const { generateSecret, verifyTotp, buildOtpauthUri } = require('../utils/totp');
const { encryptSecret, decryptSecret } = require('../utils/secretCrypto');
const { sanitizeUser } = require('../utils/sanitize');
const { MFA_METHOD } = require('../utils/constants');
const env = require('../config/env');

/** Shown in the authenticator app next to the code. */
const MFA_ISSUER = 'Ledger OnBoard';
const BACKUP_CODE_COUNT = 10;
// No look-alike characters (0/O, 1/I/L): 31 symbols, so a 10-character code carries about 49 random bits.
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
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
    if (this.isEnrolled(user)) {
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
    if (this.isEnrolled(user)) {
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
    const updated = await UserRepository.updateById(user._id, {
      mfaEnabled: true,
      mfaMethod: MFA_METHOD.TOTP,
      'mfaTotp.secretEnc': user.mfaTotp.pendingSecretEnc,
      'mfaTotp.pendingSecretEnc': null,
      'mfaTotp.lastUsedStep': step,
      'mfaTotp.backupCodeHashes': backupCodes.map((c) => this._hashBackupCode(c)),
      'mfaTotp.failedAttempts': 0,
      'mfaTotp.lockedUntil': null,
    });
    await AuditLogRepository.record({ action: 'MFA_ENABLED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id });
    return { backupCodes, user: sanitizeUser(updated) };
  }

  /** Needs the password and a current code (app or backup). Older email two-factor needs only the password. */
  async disable(userId, { password, code }) {
    const user = await this._loadWithPassword(userId, password);
    if (this.isEnrolled(user)) await this.verifyCode(user, code);
    const updated = await UserRepository.updateById(user._id, { mfaEnabled: false, mfaMethod: MFA_METHOD.NONE, ...CLEARED_TOTP_STATE });
    await AuditLogRepository.record({ action: 'MFA_DISABLED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id });
    return { user: sanitizeUser(updated) };
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
   * Accepts a current authenticator code (never one already used) or an unused backup code
   * (spent on use). Five wrong codes lock code entry for 15 minutes. Returns 'totp' or 'backup'.
   */
  async verifyCode(user, code) {
    this._assertNotLocked(user);
    const candidate = String(code || '').trim();

    if (/^\d{6}$/.test(candidate)) {
      const secret = decryptSecret(user.mfaTotp.secretEnc, this._key(), this._context(user));
      const step = verifyTotp(secret, candidate);
      if (step !== null) {
        // Atomic: only a step newer than the last accepted one is taken, so a code works once.
        const claimed = await UserRepository.model.findOneAndUpdate(
          { _id: user._id, $or: [{ 'mfaTotp.lastUsedStep': null }, { 'mfaTotp.lastUsedStep': { $lt: step } }] },
          { $set: { 'mfaTotp.lastUsedStep': step, 'mfaTotp.failedAttempts': 0 } },
        ).exec();
        if (claimed) return 'totp';
      }
    } else {
      const hash = this._hashBackupCode(candidate);
      // Atomic: the code is removed by the same update that accepts it, so it works once.
      const claimed = await UserRepository.model.findOneAndUpdate(
        { _id: user._id, 'mfaTotp.backupCodeHashes': hash },
        { $pull: { 'mfaTotp.backupCodeHashes': hash }, $set: { 'mfaTotp.failedAttempts': 0 } },
      ).exec();
      if (claimed) {
        await AuditLogRepository.record({ action: 'MFA_BACKUP_CODE_USED', actorId: user._id, actorRole: user.role, targetType: 'User', targetId: user._id });
        return 'backup';
      }
    }

    await this._recordFailure(user);
    throw invalidCode();
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
    return Array.from({ length: BACKUP_CODE_COUNT }, () => {
      let raw = '';
      for (let i = 0; i < BACKUP_CODE_LENGTH; i += 1) raw += BACKUP_CODE_ALPHABET[crypto.randomInt(BACKUP_CODE_ALPHABET.length)];
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
  }

  /** Keyed hash (the encryption key is the pepper), so a database copy alone can't be brute-forced offline. */
  _hashBackupCode(code) {
    const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return crypto.createHmac('sha256', this._key()).update(`backup-code:${normalized}`).digest('hex');
  }
}

module.exports = new MfaService();
module.exports.MFA_ISSUER = MFA_ISSUER;
module.exports.BACKUP_CODE_COUNT = BACKUP_CODE_COUNT;
