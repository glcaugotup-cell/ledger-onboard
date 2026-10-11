const crypto = require('crypto');

/**
 * Codes that people read and type (backup codes, admin reset codes, activation codes).
 * No look-alike characters (0/O, 1/I/L): 31 symbols, about 4.95 random bits each.
 */
const NO_LOOKALIKE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** `length` random characters, split into groups with dashes (e.g. 8, 4 -> "ABCD-EFGH"). */
function randomCode(length, groupSize = length) {
  let raw = '';
  for (let i = 0; i < length; i += 1) raw += NO_LOOKALIKE_ALPHABET[crypto.randomInt(NO_LOOKALIKE_ALPHABET.length)];
  return raw.match(new RegExp(`.{1,${groupSize}}`, 'g')).join('-');
}

/** What a typed code is compared as: upper case, letters and digits only ("abcd-efgh " -> "ABCDEFGH"). */
function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

module.exports = { NO_LOOKALIKE_ALPHABET, randomCode, normalizeCode };
