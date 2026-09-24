const crypto = require('crypto');
const bcrypt = require('bcryptjs');

/** Generates a 6-digit numeric OTP. */
function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function hashOtp(code) {
  return bcrypt.hash(code, 10); // OTPs are short-lived/low-entropy targets; 10 rounds is plenty
}

async function compareOtp(code, hash) {
  if (!hash) return false;
  return bcrypt.compare(code, hash);
}

module.exports = { generateOtp, hashOtp, compareOtp };
