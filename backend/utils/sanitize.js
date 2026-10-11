/** Strips fields that must never reach a client (password hash, OTP, tokens). */
function sanitizeUser(userDoc) {
  if (!userDoc) return null;
  const obj = typeof userDoc.toObject === 'function' ? userDoc.toObject() : { ...userDoc };
  delete obj.passwordHash;
  delete obj.otp;
  delete obj.mfaTotp;
  delete obj.passwordReset;
  delete obj.accountRecovery;
  delete obj.refreshTokenHash;
  delete obj.tokenVersion;
  obj.hasPaymentQr = Boolean(obj.paymentQrUrl);
  delete obj.paymentQrUrl;
  delete obj.__v;
  return obj;
}

module.exports = { sanitizeUser };
