const AuthService = require('../../services/AuthService');
const AccountLifecycleService = require('../../services/AccountLifecycleService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { authRateLimiter } = require('../../middleware/rateLimit');

/** Maps HTTP requests to AuthService calls; no business logic lives here. */
class AuthController {
  register = asyncHandler(async (req, res) => {
    const user = await AuthService.register(req.body);
    sendSuccess(res, { statusCode: 201, data: { user } });
  });

  login = asyncHandler(async (req, res) => {
    const result = await AuthService.login(req.body);
    // A completed login resets this IP's auth rate-limit count (best-effort).
    if (!result.mfaRequired) {
      await authRateLimiter.resetKey(req.ip).catch(() => {});
    }
    sendSuccess(res, { data: result });
  });

  // Password-reset codes are only checked inside POST /reset-password, so they
  // can't be verified here separately and reused.
  verifyOtp = asyncHandler(async (req, res) => {
    if (req.body.purpose === 'email_verification') {
      const result = await AuthService.verifyRegistrationOtp(req.body);
      return sendSuccess(res, { data: result });
    }
    if (req.body.purpose !== 'login_mfa') {
      throw ApiError.badRequest('Use /api/auth/reset-password to complete a password reset', 'USE_RESET_PASSWORD_ENDPOINT');
    }
    const result = await AuthService.verifyLoginOtp(req.body);
    await authRateLimiter.resetKey(req.ip).catch(() => {});
    sendSuccess(res, { data: result });
  });

  resendOtp = asyncHandler(async (req, res) => {
    const result = await AuthService.resendRegistrationOtp(req.body);
    sendSuccess(res, { data: result });
  });

  cancelRegistration = asyncHandler(async (req, res) => {
    const result = await AuthService.cancelRegistration(req.body);
    sendSuccess(res, { data: result });
  });

  logout = asyncHandler(async (req, res) => {
    const result = await AuthService.logout(req.user.id);
    sendSuccess(res, { data: result });
  });

  refresh = asyncHandler(async (req, res) => {
    const result = await AuthService.refreshAccessToken(req.body.refreshToken);
    sendSuccess(res, { data: result });
  });

  forgotPassword = asyncHandler(async (req, res) => {
    const result = await AuthService.forgotPassword(req.body);
    sendSuccess(res, { data: result });
  });

  resetPassword = asyncHandler(async (req, res) => {
    const result = await AuthService.resetPassword(req.body);
    sendSuccess(res, { data: result });
  });

  changePassword = asyncHandler(async (req, res) => {
    const result = await AuthService.changePassword(req.user.id, req.body);
    sendSuccess(res, { data: result });
  });

  activateCaretaker = asyncHandler(async (req, res) => {
    const result = await AuthService.activateCaretakerAccount(req.body);
    sendSuccess(res, { data: result });
  });

  recoverAccount = asyncHandler(async (req, res) => {
    const result = await AccountLifecycleService.recoverArchivedAccount(req.body);
    sendSuccess(res, { data: result });
  });

  deactivateAccount = asyncHandler(async (req, res) => {
    const result = await AuthService.deactivateOwnAccount(req.user.id);
    sendSuccess(res, { data: result });
  });

  setMfaPreference = asyncHandler(async (req, res) => {
    const user = await AuthService.setMfaPreference(req.user.id, req.body);
    sendSuccess(res, { data: { user } });
  });
}

module.exports = new AuthController();
