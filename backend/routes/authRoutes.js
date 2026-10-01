const express = require('express');
const AuthController = require('../controllers/auth/AuthController');
const { authenticate } = require('../middleware/auth');
const { authRateLimiter, loginRateLimiter, sensitiveAuthRateLimiters: limit } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const {
  registerValidators,
  loginValidators,
  forgotPasswordValidators,
  verifyOtpValidators,
  resendOtpValidators,
  cancelRegistrationValidators,
  resetPasswordValidators,
  changePasswordValidators,
  activateCaretakerValidators,
  accountRecoveryValidators,
  mfaPreferenceValidators,
} = require('../validators/authValidators');

const router = express.Router();

// All /api/auth/* routes are rate-limited.
router.use(authRateLimiter);

router.post('/register', registerValidators, validate, AuthController.register);
router.post('/login', loginRateLimiter, loginValidators, validate, AuthController.login);
router.post('/verify-otp', limit.verifyOtp, verifyOtpValidators, validate, AuthController.verifyOtp);
router.post('/resend-otp', limit.resendOtp, resendOtpValidators, validate, AuthController.resendOtp);
router.post('/cancel-registration', cancelRegistrationValidators, validate, AuthController.cancelRegistration);
router.post('/logout', authenticate, AuthController.logout);
router.post('/refresh', limit.refresh, AuthController.refresh);
router.post('/forgot-password', limit.forgotPassword, forgotPasswordValidators, validate, AuthController.forgotPassword);
router.post('/reset-password', limit.resetPassword, resetPasswordValidators, validate, AuthController.resetPassword);
router.patch('/change-password', authenticate, changePasswordValidators, validate, AuthController.changePassword);
router.post('/activate-caretaker', limit.activateCaretaker, activateCaretakerValidators, validate, AuthController.activateCaretaker);
router.post('/account-recovery', limit.accountRecovery, accountRecoveryValidators, validate, AuthController.recoverAccount);
router.post('/deactivate', authenticate, AuthController.deactivateAccount);
router.patch('/mfa', authenticate, mfaPreferenceValidators, validate, AuthController.setMfaPreference);

module.exports = router;
