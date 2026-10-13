const crypto = require('crypto');
const env = require('../config/env');

/**
 * Signed one-click unsubscribe links for routine email. The signature proves the link came
 * from us, so a guessed user id cannot switch someone else's email off.
 */
const sign = (userId) => crypto.createHmac('sha256', env.jwtSecret).update(`email-unsubscribe:${userId}`).digest('base64url');

function verifyUnsubscribeToken(userId, token) {
  if (typeof userId !== 'string' || typeof token !== 'string' || !/^[a-f0-9]{24}$/i.test(userId)) return false;
  const expected = Buffer.from(sign(userId));
  const given = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/** Null when the backend's public URL is unknown; the email then goes out without the link. */
function unsubscribeUrl(userId) {
  if (!env.publicApiUrl) return null;
  const url = new URL('/api/notifications/unsubscribe', env.publicApiUrl);
  url.searchParams.set('u', String(userId));
  url.searchParams.set('t', sign(String(userId)));
  return url.href;
}

module.exports = { unsubscribeUrl, verifyUnsubscribeToken };
