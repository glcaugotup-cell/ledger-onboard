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

const authRateLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMinutes * 60 * 1000,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
  // Only failed requests count toward the limit; AuthController also resets
  // the count after a successful login.
  skipSuccessfulRequests: true,
});

const paymentVerificationRateLimiter = rateLimit({
  windowMs: env.paymentRateLimitWindowMinutes * 60 * 1000,
  max: env.paymentRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler,
});

module.exports = { authRateLimiter, paymentVerificationRateLimiter };
