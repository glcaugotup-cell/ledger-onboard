// TOTP helper: checked against the published RFC test vectors and the authenticator-app settings.
const {
  base32Encode,
  base32Decode,
  generateSecret,
  hotp,
  generateTotp,
  verifyTotp,
  buildOtpauthUri,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
} = require('../utils/totp');

// RFC 4226 / RFC 6238 test secret: the ASCII bytes of "12345678901234567890".
const RFC_SECRET_BYTES = Buffer.from('12345678901234567890', 'ascii');
const RFC_SECRET_BASE32 = base32Encode(RFC_SECRET_BYTES);

describe('base32 (RFC 4648 test vectors, without padding)', () => {
  test.each([
    ['', ''],
    ['f', 'MY'],
    ['fo', 'MZXQ'],
    ['foo', 'MZXW6'],
    ['foob', 'MZXW6YQ'],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI'],
  ])('%j <-> %s', (text, encoded) => {
    expect(base32Encode(Buffer.from(text))).toBe(encoded);
    expect(base32Decode(encoded).toString()).toBe(text);
  });

  test('decoding accepts lower case, spaces, hyphens and padding, as people type keys', () => {
    expect(base32Decode('mzxw 6ytb-oi======').toString()).toBe('foobar');
  });

  test('decoding rejects characters outside the alphabet', () => {
    expect(() => base32Decode('MZXW1')).toThrow('Invalid base32 character');
  });
});

describe('HOTP (RFC 4226 Appendix D test vectors)', () => {
  const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  test.each(expected.map((code, counter) => [counter, code]))('counter %i -> %s', (counter, code) => {
    expect(hotp(RFC_SECRET_BYTES, counter)).toBe(code);
  });
});

describe('TOTP (RFC 6238 Appendix B test vectors, SHA-1)', () => {
  // RFC 6238 publishes 8-digit codes; the same algorithm produces the 6-digit codes apps show.
  test.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('T = %i s -> %s', (seconds, code) => {
    expect(generateTotp(RFC_SECRET_BASE32, { nowMs: seconds * 1000, digits: 8 })).toBe(code);
    expect(verifyTotp(RFC_SECRET_BASE32, code, { nowMs: seconds * 1000, digits: 8 })).toBe(Math.floor(seconds / 30));
  });
});

describe('authenticator-app settings', () => {
  test('codes are 6 digits on 30-second steps (Google and Microsoft Authenticator defaults)', () => {
    expect(TOTP_DIGITS).toBe(6);
    expect(TOTP_PERIOD_SECONDS).toBe(30);
    expect(generateTotp(RFC_SECRET_BASE32, { nowMs: 59 * 1000 })).toBe('287082'); // last 6 digits of 94287082
  });

  test('a new secret is 20 random bytes, base32-encoded, and never repeats', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(a)).toHaveLength(20);
    expect(a).not.toBe(b);
  });

  test('the QR code URI names Ledger OnBoard as issuer and spells out SHA1, 6 digits and 30 seconds', () => {
    const uri = buildOtpauthUri({ secret: 'JBSWY3DPEHPK3PXP', accountName: 'juan.delacruz@gmail.com', issuer: 'Ledger OnBoard' });
    expect(uri).toBe(
      'otpauth://totp/Ledger%20OnBoard:juan.delacruz%40gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=Ledger%20OnBoard&algorithm=SHA1&digits=6&period=30'
    );
  });
});

describe('verifyTotp', () => {
  const secret = generateSecret();
  const now = Date.UTC(2026, 9, 11, 12, 0, 15); // mid-step, so ±1 step is unambiguous
  const step = Math.floor(now / 1000 / 30);

  test('accepts the current code and one step either side, returning the matched step', () => {
    expect(verifyTotp(secret, generateTotp(secret, { nowMs: now }), { nowMs: now })).toBe(step);
    expect(verifyTotp(secret, generateTotp(secret, { nowMs: now - 30000 }), { nowMs: now })).toBe(step - 1);
    expect(verifyTotp(secret, generateTotp(secret, { nowMs: now + 30000 }), { nowMs: now })).toBe(step + 1);
  });

  test('rejects codes two or more steps away', () => {
    expect(verifyTotp(secret, generateTotp(secret, { nowMs: now - 60000 }), { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, generateTotp(secret, { nowMs: now + 60000 }), { nowMs: now })).toBeNull();
  });

  test('rejects wrong, malformed and empty codes', () => {
    const right = generateTotp(secret, { nowMs: now });
    const wrong = String((Number(right) + 1) % 1000000).padStart(6, '0');
    expect(verifyTotp(secret, wrong, { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, '12345', { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, 'abcdef', { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, '', { nowMs: now })).toBeNull();
    expect(verifyTotp(secret, undefined, { nowMs: now })).toBeNull();
  });
});
