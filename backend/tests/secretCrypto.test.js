// AES-256-GCM encryption of two-factor secrets at rest. Keys here are random per run, never stored.
const crypto = require('crypto');
const { parseKey, encryptSecret, decryptSecret } = require('../utils/secretCrypto');

const key = crypto.randomBytes(32);
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

/** Changes one character of one dot-separated part, keeping it valid base64url. */
function tamper(encoded, partIndex) {
  const parts = encoded.split('.');
  const part = parts[partIndex];
  parts[partIndex] = (part[0] === 'A' ? 'B' : 'A') + part.slice(1);
  return parts.join('.');
}

test('round trip: what is encrypted decrypts back to the same text', () => {
  const encoded = encryptSecret(SECRET, key, 'mfa:user1');
  expect(decryptSecret(encoded, key, 'mfa:user1')).toBe(SECRET);
});

test('the stored form is versioned and never contains the secret', () => {
  const encoded = encryptSecret(SECRET, key, 'mfa:user1');
  expect(encoded).toMatch(/^v1\.[\w-]+\.[\w-]+\.[\w-]+$/);
  expect(encoded).not.toContain(SECRET);
});

test('the same secret encrypts differently every time (random IV)', () => {
  expect(encryptSecret(SECRET, key, 'mfa:user1')).not.toBe(encryptSecret(SECRET, key, 'mfa:user1'));
});

test.each([
  ['ciphertext', 3],
  ['authentication tag', 2],
  ['IV', 1],
])('a tampered %s fails to decrypt', (label, partIndex) => {
  const encoded = encryptSecret(SECRET, key, 'mfa:user1');
  expect(() => decryptSecret(tamper(encoded, partIndex), key, 'mfa:user1')).toThrow();
});

test('a shortened authentication tag is refused', () => {
  const [version, iv, tag, ciphertext] = encryptSecret(SECRET, key, 'mfa:user1').split('.');
  const shortTag = Buffer.from(tag, 'base64url').subarray(0, 8).toString('base64url');
  expect(() => decryptSecret([version, iv, shortTag, ciphertext].join('.'), key, 'mfa:user1')).toThrow();
});

test('the wrong key fails to decrypt', () => {
  const encoded = encryptSecret(SECRET, key, 'mfa:user1');
  expect(() => decryptSecret(encoded, crypto.randomBytes(32), 'mfa:user1')).toThrow();
});

test('a value copied onto another account fails to decrypt', () => {
  const encoded = encryptSecret(SECRET, key, 'mfa:user1');
  expect(() => decryptSecret(encoded, key, 'mfa:user2')).toThrow();
});

test('malformed stored values are refused', () => {
  expect(() => decryptSecret('', key)).toThrow('Unrecognised encrypted value');
  expect(() => decryptSecret('v2.a.b.c', key)).toThrow('Unrecognised encrypted value');
  expect(() => decryptSecret('plain-text-secret', key)).toThrow('Unrecognised encrypted value');
});

test('parseKey accepts exactly 32 bytes of base64 and nothing else', () => {
  expect(parseKey(crypto.randomBytes(32).toString('base64'))).toHaveLength(32);
  expect(() => parseKey(crypto.randomBytes(16).toString('base64'))).toThrow('32 bytes');
  expect(() => parseKey('not a key')).toThrow('32 bytes');
  expect(() => parseKey('')).toThrow('32 bytes');
});
