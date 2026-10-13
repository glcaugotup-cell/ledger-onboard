const env = require('../config/env');
const { ROLES } = require('./constants');

/** The main admin is the admin account whose email is MAIN_ADMIN_EMAIL. Emails cannot be changed. */
function isMainAdmin(user) {
  return Boolean(user && user.role === ROLES.ADMIN && String(user.email || '').toLowerCase() === env.mainAdminEmail);
}

module.exports = { isMainAdmin };
