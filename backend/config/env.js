/** Centralized environment configuration; other modules read config from here, not process.env. */
require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT) || 5000,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  mongoUri: required('MONGODB_URI', process.env.NODE_ENV === 'test' ? 'mongodb://127.0.0.1:27017/ledger_onboard_test' : undefined),

  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'test' ? 'test-secret-do-not-use-in-prod' : undefined),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || (process.env.NODE_ENV === 'test' ? 'test-refresh-secret' : required('JWT_REFRESH_SECRET')),
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 12,

  archiveWarningDays: Number(process.env.ACCOUNT_ARCHIVE_WARNING_DAYS) || 25,
  archiveDays: Number(process.env.ACCOUNT_ARCHIVE_DAYS) || 30,
  lifecycleCron: process.env.ACCOUNT_LIFECYCLE_CRON || '0 2 * * *',

  // Tests always use the console transport so they never send real email.
  emailTransport: process.env.NODE_ENV === 'test' ? 'console' : process.env.EMAIL_TRANSPORT || 'console',
  emailFrom: process.env.EMAIL_FROM || 'Ledger OnBoard <no-reply@ledgeronboard.local>',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },

  otpTtlMinutes: Number(process.env.OTP_TTL_MINUTES) || 10,

  authRateLimitWindowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES) || 15,
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  paymentRateLimitWindowMinutes: Number(process.env.PAYMENT_RATE_LIMIT_WINDOW_MINUTES) || 15,
  paymentRateLimitMax: Number(process.env.PAYMENT_RATE_LIMIT_MAX) || 20,

  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 5,
  maxVideoUploadMb: Number(process.env.MAX_VIDEO_UPLOAD_MB) || 50,
};

module.exports = env;
