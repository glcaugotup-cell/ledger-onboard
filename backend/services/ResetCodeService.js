const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const ApiError = require('../utils/ApiError');
const { compareOtp } = require('../utils/otp');
const { normalizeCode } = require('../utils/oneTimeCodes');
const { PASSWORD_RESET_CODE } = require('../utils/constants');
const MfaService = require('./MfaService');

// Code-only requests (no password): each endpoint has its own failure counter on the account,
// so failing one never locks another, and none of them touches the sign-in code lock.
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const LOCK_ACTIONS = Object.freeze({
  passwordReset: 'PASSWORD_RESET_LOCKED', // POST /auth/reset-password
  accountRecovery: 'ACCOUNT_RECOVERY_LOCKED', // POST /auth/account-recovery
});

const invalidCode = () => ApiError.badRequest('Invalid or expired code', 'INVALID_OTP');

/**
 * The codes that prove who someone is without their password: an admin-issued reset code
 * (8 characters), an authenticator code (6 digits) or a backup code (10 characters), told
 * apart by length. Shared by password reset and archived-account recovery.
 */
class ResetCodeService {
  invalidCode() {
    return invalidCode();
  }

  /** 'admin_code' | 'totp' | 'backup', or null. An app or backup code is used up by a match. */
  async match(user, code) {
    const normalized = normalizeCode(code);
    if (normalized.length === PASSWORD_RESET_CODE.LENGTH) {
      return (await this._matchesAdminCode(user, normalized)) ? 'admin_code' : null;
    }
    return MfaService.consumeCode(user, code); // null when two-factor is off
  }

  async _matchesAdminCode(user, normalized) {
    const otp = user.otp;
    if (!otp?.codeHash || otp.purpose !== 'password_reset') return false;
    if (!otp.expiresAt || otp.expiresAt.getTime() < Date.now()) return false;
    return compareOtp(normalized, otp.codeHash);
  }

  assertNotLocked(user, counter) {
    const lockedUntil = user[counter]?.lockedUntil;
    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      const retryAfterSeconds = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
      throw ApiError.tooManyRequests('Too many incorrect attempts. Try again later.', 'OTP_ATTEMPTS_EXCEEDED', { retryAfterSeconds });
    }
  }

  async recordFailure(user, counter) {
    const updated = await UserRepository.model
      .findByIdAndUpdate(user._id, { $inc: { [`${counter}.failedAttempts`]: 1 } }, { new: true })
      .select(`+${counter}.failedAttempts`)
      .exec();
    if ((updated?.[counter]?.failedAttempts || 0) >= MAX_FAILED_ATTEMPTS) {
      await UserRepository.updateById(user._id, {
        [`${counter}.failedAttempts`]: 0,
        [`${counter}.lockedUntil`]: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
      });
      await AuditLogRepository.record({ action: LOCK_ACTIONS[counter], targetType: 'User', targetId: user._id, metadata: { minutes: LOCK_MINUTES } });
    }
  }

  /**
   * The update for a new password set with a code: every device is signed out (session version
   * up), any code pending in the slot goes (an admin code is spent by its use), and this
   * endpoint's counter is cleared.
   */
  newPasswordUpdate(passwordHash, counter) {
    return {
      passwordHash,
      refreshTokenHash: null,
      $inc: { tokenVersion: 1 },
      otp: { codeHash: null, purpose: null, expiresAt: null, attempts: 0 },
      [`${counter}.failedAttempts`]: 0,
      [`${counter}.lockedUntil`]: null,
    };
  }
}

module.exports = new ResetCodeService();
