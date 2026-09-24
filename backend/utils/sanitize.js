/** Strips fields that must never reach a client (password hash, OTP, tokens). */
function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  const obj = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete obj.passwordHash;
  delete obj.otp;
  delete obj.refreshTokenHash;
  delete obj.__v;
  return obj;
}

module.exports = { sanitizeUser };
