const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

async function hashPassword(plain) {
  return bcrypt.hash(plain, env.bcryptSaltRounds);
}

async function comparePassword(plain, hash) {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/** A real bcrypt hash of 32 random bytes that are thrown away: no password matches it. */
async function unusablePasswordHash() {
  return hashPassword(crypto.randomBytes(32).toString('base64url'));
}

module.exports = { hashPassword, comparePassword, unusablePasswordHash };
