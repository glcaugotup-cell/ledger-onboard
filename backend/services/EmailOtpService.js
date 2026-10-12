const Users = require('../repositories/UserRepository');
const EmailService = require('./EmailService');
const ApiError = require('../utils/ApiError');
const { generateOtp, hashOtp, compareOtp } = require('../utils/otp');
const { tokenVersionOf } = require('../utils/jwt');
const env = require('../config/env');

const COOLDOWN_SECONDS = 45;
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const PURPOSES = Object.freeze({ setup: 'email_mfa_setup', login: 'login_mfa', reset: 'password_reset', settings: 'email_mfa_settings' });
const versionCondition = (user) => tokenVersionOf(user.tokenVersion) === 0
  ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
  : { tokenVersion: user.tokenVersion };

/** Independent, hashed, single-use email codes. Resends never reset the guess limit. */
class EmailOtpService {
  isEnrolled(user) {
    return Boolean(user?.mfaEnabled && user.mfaMethod === 'email' && user.emailMfaEnabledAt);
  }

  assertAvailable() {
    if (!env.emailAccountFlowsEnabled || env.emailTransport === 'none' || (env.isProduction && env.emailTransport === 'console')) {
      throw new ApiError(503, 'EMAIL_NOT_AVAILABLE', 'Email verification is currently unavailable. Please try again later or use an existing recovery method.');
    }
  }

  assertNotLocked(record) {
    if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
      throw ApiError.tooManyRequests('Too many incorrect attempts. Try again later.', 'OTP_ATTEMPTS_EXCEEDED',
        { retryAfterSeconds: Math.ceil((record.lockedUntil.getTime() - Date.now()) / 1000) });
    }
  }

  async issue(user, purpose, context = null) {
    this.assertAvailable();
    if (!PURPOSES[purpose]) throw new Error('Unknown email code purpose');
    const record = user.emailCodes?.[purpose];
    this.assertNotLocked(record);
    const now = new Date();
    const prefix = `emailCodes.${purpose}`;
    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiry = new Date(now.getTime() + env.otpTtlMinutes * 60000);
    const claimed = await Users.model.findOneAndUpdate({ _id: user._id, $and: [
      versionCondition(user),
      (record?.failedAttempts || 0) === 0
        ? { $or: [{ [`${prefix}.failedAttempts`]: null }, { [`${prefix}.failedAttempts`]: 0 }] }
        : { [`${prefix}.failedAttempts`]: record.failedAttempts },
      { $or: [{ [`${prefix}.issuedAt`]: null }, { [`${prefix}.issuedAt`]: { $lte: new Date(now.getTime() - COOLDOWN_SECONDS * 1000) } }] },
      { $or: [{ [`${prefix}.lockedUntil`]: null }, { [`${prefix}.lockedUntil`]: { $lte: now } }] },
    ] }, { $set: {
      [`${prefix}.codeHash`]: codeHash, [`${prefix}.expiresAt`]: expiry, [`${prefix}.issuedAt`]: now,
      [`${prefix}.context`]: context, [`${prefix}.tokenVersion`]: tokenVersionOf(user.tokenVersion),
      [`${prefix}.failedAttempts`]: record?.lockedUntil && record.lockedUntil <= now ? 0 : (record?.failedAttempts || 0),
    } }).exec();
    if (!claimed) throw ApiError.tooManyRequests('Please wait before requesting another email code.', 'OTP_RESEND_COOLDOWN', { retryAfterSeconds: COOLDOWN_SECONDS });
    try {
      const sent = await EmailService.sendOtpEmail(user.email, code, PURPOSES[purpose], user.firstName);
      if (sent?.skipped) throw new Error('Email was skipped');
    } catch {
      // Clear only this failed send; never erase a newer request or another purpose.
      await Users.model.updateOne({ _id: user._id, [`${prefix}.codeHash`]: codeHash }, { $set: { [`${prefix}.codeHash`]: null, [`${prefix}.expiresAt`]: null } }).exec();
      throw ApiError.badRequest('Unable to send verification code. Please try again.', 'OTP_EMAIL_DELIVERY_FAILED');
    }
    return { message: 'Check your email for a verification code.', resendAfterSeconds: COOLDOWN_SECONDS };
  }

  async consume(user, purpose, code, { context, countFailures = true } = {}) {
    const record = user.emailCodes?.[purpose];
    const prefix = `emailCodes.${purpose}`;
    if (countFailures) this.assertNotLocked(record);
    if (!record?.codeHash || !record.expiresAt || record.expiresAt.getTime() <= Date.now()
      || record.tokenVersion !== tokenVersionOf(user.tokenVersion) || (context !== undefined && record.context !== context)) return false;
    const filter = { _id: user._id, [`${prefix}.codeHash`]: record.codeHash, $and: [versionCondition(user)] };
    const matches = /^\d{6}$/.test(String(code)) && await compareOtp(code, record.codeHash);
    if (!matches) {
      if (countFailures) {
        const updated = await Users.model.findOneAndUpdate(filter, { $inc: { [`${prefix}.failedAttempts`]: 1 } }, { new: true }).select('+emailCodes').exec();
        if ((updated?.emailCodes?.[purpose]?.failedAttempts || 0) >= MAX_ATTEMPTS) {
          await Users.model.updateOne(filter, { $set: { [`${prefix}.lockedUntil`]: new Date(Date.now() + LOCK_MINUTES * 60000) } }).exec();
        }
      }
      return false;
    }
    const now = new Date();
    filter[`${prefix}.expiresAt`] = { $gt: now };
    if (context !== undefined) filter[`${prefix}.context`] = context;
    if (countFailures) {
      filter[`${prefix}.failedAttempts`] = { $lt: MAX_ATTEMPTS };
      filter.$and.push({ $or: [{ [`${prefix}.lockedUntil`]: null }, { [`${prefix}.lockedUntil`]: { $lte: now } }] });
    }
    const claimed = await Users.model.findOneAndUpdate(filter, { $set: {
      [`${prefix}.codeHash`]: null, [`${prefix}.expiresAt`]: null, [`${prefix}.issuedAt`]: null,
      [`${prefix}.failedAttempts`]: 0, [`${prefix}.lockedUntil`]: null,
    } }).exec();
    return Boolean(claimed);
  }
}
module.exports = new EmailOtpService();
