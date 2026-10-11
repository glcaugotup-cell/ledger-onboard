const crypto = require('crypto');

/**
 * Time-based one-time passwords (RFC 6238 over RFC 4226 HOTP), built on Node's crypto.
 * Settings match Google Authenticator and Microsoft Authenticator: HMAC-SHA1, 6 digits, 30 seconds.
 */
const TOTP_DIGITS = 6;
const TOTP_PERIOD_SECONDS = 30;
const SECRET_BYTES = 20; // 160 bits, the size RFC 4226 recommends for HMAC-SHA1
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** Accepts the forms people type or apps show: any case, spaces, hyphens, optional "=" padding. */
function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new random secret, base32-encoded (the form authenticator apps take). */
function generateSecret() {
  return base32Encode(crypto.randomBytes(SECRET_BYTES));
}

/** RFC 4226 HOTP: HMAC-SHA1 of the 8-byte counter, dynamically truncated to `digits` digits. */
function hotp(secretBuffer, counter, digits = TOTP_DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** The 30-second step number for a moment in time (milliseconds). */
function stepAt(nowMs) {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code an authenticator app shows for `secret` (base32) at `nowMs`. */
function generateTotp(secret, { nowMs = Date.now(), digits = TOTP_DIGITS } = {}) {
  return hotp(base32Decode(secret), stepAt(nowMs), digits);
}

/**
 * Checks a code against the current step and one step either side (clock drift).
 * Returns the matched step number, or null. Comparison is constant-time per step.
 */
function verifyTotp(secret, code, { nowMs = Date.now(), window = 1, digits = TOTP_DIGITS } = {}) {
  const candidate = String(code || '').replace(/\s/g, '');
  if (!new RegExp(`^\\d{${digits}}$`).test(candidate)) return null;
  const key = base32Decode(secret);
  const current = stepAt(nowMs);
  for (let step = current - window; step <= current + window; step += 1) {
    if (step < 0) continue;
    const expected = hotp(key, step, digits);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return step;
  }
  return null;
}

/**
 * otpauth:// URI for the QR code (Key URI Format used by Google and Microsoft Authenticator).
 * The issuer appears both as the label prefix and as the issuer parameter, as those apps expect.
 */
function buildOtpauthUri({ secret, accountName, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  // URLSearchParams writes spaces as "+"; authenticator apps expect %20.
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, '%20')}`;
}

module.exports = {
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  base32Encode,
  base32Decode,
  generateSecret,
  hotp,
  generateTotp,
  verifyTotp,
  buildOtpauthUri,
};
