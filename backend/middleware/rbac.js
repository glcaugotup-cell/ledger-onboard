const ApiError = require('../utils/ApiError');

/**
 * Role gate: requireRole('landlord', 'admin') only lets those roles through.
 * Must run after `authenticate`. This is the real authorization check; hiding
 * UI on the frontend is not.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Authentication required', 'MISSING_TOKEN'));
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action', 'FORBIDDEN_ROLE'));
    }
    next();
  };
}

module.exports = { requireRole };
