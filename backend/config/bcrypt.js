/**
 * Password hashing cost, on its own so password hashing doesn't need the rest of the app's
 * configuration (local scripts such as the migration only have MONGODB_URI). config/env.js
 * re-exports it as env.bcryptSaltRounds.
 */
require('dotenv').config();

// Tests use a low hashing cost for speed (tests/helpers/jestEnv.js); production must never run with one.
const bcryptSaltRounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;
if (process.env.NODE_ENV === 'production' && bcryptSaltRounds < 10) {
  throw new Error(`BCRYPT_SALT_ROUNDS must be at least 10 in production (got ${bcryptSaltRounds})`);
}

module.exports = { bcryptSaltRounds };
