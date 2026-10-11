const crypto = require('crypto');

/**
 * AES-256-GCM for small secrets stored in the database (two-factor secrets).
 * Output: "v1.<iv>.<auth tag>.<ciphertext>", each part base64url. The optional
 * `context` (e.g. the user's id) is bound as additional authenticated data, so a
 * value copied onto another record fails to decrypt.
 */
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Decodes a base64 key and checks it is exactly 32 bytes. Throws a clear error otherwise. */
function parseKey(base64Key) {
  const key = Buffer.from(String(base64Key || ''), 'base64');
  if (key.length !== KEY_BYTES) throw new Error(`The encryption key must be ${KEY_BYTES} bytes, base64-encoded`);
  return key;
}

function encryptSecret(plaintext, key, context = '') {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(String(context)));
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

/** Throws if the value was changed, was encrypted with another key, or belongs to another context. */
function decryptSecret(encoded, key, context = '') {
  const [version, iv, tag, ciphertext] = String(encoded || '').split('.');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) throw new Error('Unrecognised encrypted value');
  // A fixed tag length stops a shortened (weaker) tag from being accepted.
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(String(context)));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

module.exports = { parseKey, encryptSecret, decryptSecret, KEY_BYTES };
