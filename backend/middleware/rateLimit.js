const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/** 429 responses use the same envelope as the rest of the API. */
function limitHandler(req, res) {
  res.status(429).json({
    success: false,
    data: null,
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  });
}

function buildLimiter({ windowMinutes, max, skipSuccessfulRequests = false, skip }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: limitHandler,
    skipSuccessfulRequests,
    skip,
  });
}

// Broad IP ceiling protects public discovery and authenticated APIs from bursts.
const apiRateLimiter = buildLimiter({ windowMinutes: env.apiRateLimitWindowMinutes, max: env.apiRateLimitMax, skip: (req) => req.path === '/health' });

const authRateLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMinutes * 60 * 1000,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
  // Only failed requests count toward the limit; AuthController also resets
  // the count after a successful login.
  skipSuccessfulRequests: true,
  // Login has both an IP ceiling below and a per-account failed-attempt lockout in AuthService.
  skip: (req) => req.path === '/login',
});

// Login has a separate IP ceiling in addition to AuthService's per-account lockout.
const loginRateLimiter = buildLimiter({
  windowMinutes: env.authRateLimitWindowMinutes,
  max: env.loginRateLimitMax,
  skipSuccessfulRequests: true,
});

// Additional throttling for OTP, password recovery and account activation endpoints.
const sensitiveAuthRateLimiter = buildLimiter({
  windowMinutes: env.sensitiveAuthRateLimitWindowMinutes,
  max: env.sensitiveAuthRateLimitMax,
});

const paymentVerificationRateLimiter = rateLimit({
  windowMs: env.paymentRateLimitWindowMinutes * 60 * 1000,
  max: env.paymentRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

const paymentSubmissionRateLimiter = buildLimiter({ windowMinutes: env.paymentRateLimitWindowMinutes, max: env.paymentSubmissionRateLimitMax });
const uploadRateLimiter = buildLimiter({ windowMinutes: env.uploadRateLimitWindowMinutes, max: env.uploadRateLimitMax });
const utilityEntryRateLimiter = buildLimiter({ windowMinutes: env.utilityRateLimitWindowMinutes, max: env.utilityRateLimitMax });

module.exports = {
  apiRateLimiter,
  authRateLimiter,
  loginRateLimiter,
  sensitiveAuthRateLimiter,
  paymentVerificationRateLimiter,
  paymentSubmissionRateLimiter,
  uploadRateLimiter,
  utilityEntryRateLimiter,
};
