const { verifyAccessToken } = require('../utils/jwt');
const UserRepository = require('../repositories/UserRepository');
const AccountLifecycleService = require('../services/AccountLifecycleService');
const ApiError = require('../utils/ApiError');
const { ACCOUNT_STATUS } = require('../utils/constants');

/**
 * Authenticates the request and attaches req.user.
 * Re-loads the user on every request (rather than trusting the JWT's claims)
 * so suspensions, archiving and role changes take effect immediately.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Authentication required', 'MISSING_TOKEN');
    }

    const payload = verifyAccessToken(token); // throws JsonWebTokenError/TokenExpiredError -> handled by errorHandler

    const user = await UserRepository.findById(payload.sub);
    if (!user) throw ApiError.unauthorized('Account no longer exists', 'ACCOUNT_NOT_FOUND');

    if (user.accountStatus === ACCOUNT_STATUS.ARCHIVED) {
      throw ApiError.forbidden('This account has been archived due to inactivity', 'ACCOUNT_ARCHIVED');
    }
    if (user.accountStatus === ACCOUNT_STATUS.SUSPENDED) {
      throw ApiError.forbidden('This account has been suspended', 'ACCOUNT_SUSPENDED');
    }
    if (user.accountStatus === ACCOUNT_STATUS.DEACTIVATED) {
      throw ApiError.forbidden('This account has been deactivated', 'ACCOUNT_DEACTIVATED');
    }

    req.user = { id: String(user._id), role: user.role, accountStatus: user.accountStatus };

    // Resets the inactivity clock; fire-and-forget so it never fails the request.
    AccountLifecycleService.recordActivity(user._id).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[auth] failed to record activity:', err.message);
    });

    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches req.user when a valid token is present, but never rejects the request. For public-but-personalized routes. */
async function optionalAuthenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return next();
  return authenticate(req, res, (err) => {
    if (err) req.user = undefined;
    next();
  });
}

module.exports = { authenticate, optionalAuthenticate };
