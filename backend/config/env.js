/** Centralized environment configuration; other modules read config from here, not process.env. */
require('dotenv').config();
const { parseKey } = require('../utils/secretCrypto');

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// CLIENT_ORIGIN may list several comma-separated origins (e.g. the Vercel URL
// and http://localhost:5173). Email links can use a separate public app URL.
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const emailAppUrl = new URL((process.env.EMAIL_APP_URL || clientOrigins[0]).trim());
if (!['http:', 'https:'].includes(emailAppUrl.protocol) || emailAppUrl.username || emailAppUrl.password) {
  throw new Error('EMAIL_APP_URL must be an http(s) frontend URL without credentials');
}

// A typo (e.g. "smpt") must stop the server at boot, not silently fall back to SMTP and time out on every send.
const EMAIL_TRANSPORTS = ['console', 'brevo', 'smtp', 'none'];
const configuredEmailTransport = (process.env.EMAIL_TRANSPORT || 'console').trim().toLowerCase();
if (!EMAIL_TRANSPORTS.includes(configuredEmailTransport)) {
  throw new Error(`EMAIL_TRANSPORT must be one of: ${EMAIL_TRANSPORTS.join(', ')} (got "${configuredEmailTransport}")`);
}

// Tests use a low hashing cost for speed (tests/helpers/jestEnv.js); production must never run with one.
const bcryptSaltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
if (process.env.NODE_ENV === 'production' && bcryptSaltRounds < 10) {
  throw new Error(`BCRYPT_SALT_ROUNDS must be at least 10 in production (got ${bcryptSaltRounds})`);
}

// Two-factor secrets are encrypted with this key (32 bytes, base64). Production cannot run without
// it; elsewhere two-factor setup is simply unavailable until it is set. A malformed key always stops the boot.
const mfaEncryptionKeyText = (process.env.MFA_ENCRYPTION_KEY || '').trim();
if (process.env.NODE_ENV === 'production' && !mfaEncryptionKeyText) {
  throw new Error('MFA_ENCRYPTION_KEY is required in production (32 random bytes, base64)');
}
let mfaEncryptionKey = null;
if (mfaEncryptionKeyText) {
  try {
    mfaEncryptionKey = parseKey(mfaEncryptionKeyText);
  } catch {
    throw new Error('MFA_ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
  }
}

// Sign-up email verification (a code sent by email) is off unless explicitly turned on.
// Like EMAIL_TRANSPORT, a typo stops the server at boot instead of silently picking a mode.
const emailVerificationSetting = (process.env.EMAIL_VERIFICATION_REQUIRED || '').trim().toLowerCase() || 'false';
if (!['true', 'false'].includes(emailVerificationSetting)) {
  throw new Error(`EMAIL_VERIFICATION_REQUIRED must be true or false (got "${emailVerificationSetting}")`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT) || 5000,
  clientOrigins,
  clientOrigin: clientOrigins[0],
  emailAppUrl: emailAppUrl.origin,
  // Behind a hosting proxy (Render), trust one hop so req.ip is the real client IP for rate limiting.
  trustProxy: process.env.TRUST_PROXY !== undefined ? Number(process.env.TRUST_PROXY) : process.env.NODE_ENV === 'production' ? 1 : 0,

  mongoUri: required('MONGODB_URI', process.env.NODE_ENV === 'test' ? 'mongodb://127.0.0.1:27017/ledger_onboard_test' : undefined),

  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'test' ? 'test-secret-do-not-use-in-prod' : undefined),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'test' ? 'test-refresh-secret' : required('JWT_REFRESH_SECRET')),
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  bcryptSaltRounds,

  archiveWarningDays: Number(process.env.ACCOUNT_ARCHIVE_WARNING_DAYS) || 25,
  archiveDays: Number(process.env.ACCOUNT_ARCHIVE_DAYS) || 30,
  lifecycleCron: process.env.ACCOUNT_LIFECYCLE_CRON || '0 2 * * *',

  // Days after the move-in date before a landlord may mark a reserved tenant as a no-show.
  noShowGraceDays: /^\d+$/.test((process.env.NO_SHOW_GRACE_DAYS || '').trim()) ? Number(process.env.NO_SHOW_GRACE_DAYS) : 5,

  // 'console' prints emails to the log, 'smtp' sends through the SMTP_* server, 'brevo'
  // sends through Brevo's HTTPS API (for hosts that block outgoing SMTP, like Render's free plan),
  // and 'none' sends nothing at all. Tests always use the console transport so they never send real email.
  emailTransport: process.env.NODE_ENV === 'test' ? 'console' : configuredEmailTransport,
  emailFrom: process.env.EMAIL_FROM || 'Ledger OnBoard <no-reply@ledgeronboard.local>',
  brevoApiKey: (process.env.BREVO_API_KEY || '').trim(),
  // Longest any single email send may take, so a blocked mail server can't hang a request (e.g. registration).
  emailTimeoutMs: Number(process.env.EMAIL_TIMEOUT_MS) || 10000,
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES) || 10,
  // When false, new accounts can sign in at once and no sign-up code is sent.
  emailVerificationRequired: emailVerificationSetting === 'true',
  // Buffer (32 bytes) or null when unset outside production. Never logged.
  mfaEncryptionKey,

  authRateLimitWindowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES) || 15,
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 30,
  sensitiveAuthRateLimitWindowMinutes: Number(process.env.SENSITIVE_AUTH_RATE_LIMIT_WINDOW_MINUTES) || 15,
  sensitiveAuthRateLimitMax: Number(process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX) || 8,
  apiRateLimitWindowMinutes: Number(process.env.API_RATE_LIMIT_WINDOW_MINUTES) || 15,
  apiRateLimitMax: Number(process.env.API_RATE_LIMIT_MAX) || 900,
  paymentRateLimitWindowMinutes: Number(process.env.PAYMENT_RATE_LIMIT_WINDOW_MINUTES) || 15,
  paymentRateLimitMax: Number(process.env.PAYMENT_RATE_LIMIT_MAX) || 20,
  paymentSubmissionRateLimitMax: Number(process.env.PAYMENT_SUBMISSION_RATE_LIMIT_MAX) || 10,
  uploadRateLimitWindowMinutes: Number(process.env.UPLOAD_RATE_LIMIT_WINDOW_MINUTES) || 15,
  uploadRateLimitMax: Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 30,
  utilityRateLimitWindowMinutes: Number(process.env.UTILITY_RATE_LIMIT_WINDOW_MINUTES) || 15,
  utilityRateLimitMax: Number(process.env.UTILITY_RATE_LIMIT_MAX) || 30,

  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 5,
  maxVideoUploadMb: Number(process.env.MAX_VIDEO_UPLOAD_MB) || 50,
};

module.exports = env;
