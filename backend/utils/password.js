const bcrypt = require('bcryptjs');
const env = require('../config/env');

async function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptSaltRounds);
}

async function comparePassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, comparePassword };
