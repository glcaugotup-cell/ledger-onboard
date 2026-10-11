// Token purposes: a two-factor challenge, a sign-in token and single-purpose links never stand in for each other.
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  MFA_CHALLENGE_PURPOSE,
} = require('../utils/jwt');

const user = { _id: '64b000000000000000000001', role: 'tenant', accountStatus: 'active' };

test('a challenge token carries its own purpose and lasts 5 minutes', () => {
  const payload = verifyMfaChallengeToken(signMfaChallengeToken(user));
  expect(payload.sub).toBe(user._id);
  expect(payload.purpose).toBe(MFA_CHALLENGE_PURPOSE);
  expect(MFA_CHALLENGE_PURPOSE).toBe('mfa_pending');
  expect(payload.exp - payload.iat).toBe(5 * 60);
});

test('a challenge token is refused as a sign-in token', () => {
  expect(() => verifyAccessToken(signMfaChallengeToken(user))).toThrow(jwt.JsonWebTokenError);
});

test('a sign-in token is refused as a challenge token', () => {
  expect(() => verifyMfaChallengeToken(signAccessToken(user))).toThrow(jwt.JsonWebTokenError);
});

test('a challenge-purpose claim signed with the sign-in secret is still refused as a challenge (separate key)', () => {
  const forged = jwt.sign({ sub: user._id, purpose: MFA_CHALLENGE_PURPOSE }, env.jwtSecret, { expiresIn: '5m' });
  expect(() => verifyMfaChallengeToken(forged)).toThrow(jwt.JsonWebTokenError);
});

test('a caretaker activation token is refused as a sign-in token', () => {
  const activation = jwt.sign({ sub: user._id, purpose: 'caretaker_activation' }, env.jwtSecret, { expiresIn: '3d' });
  expect(() => verifyAccessToken(activation)).toThrow(jwt.JsonWebTokenError);
});

test('a refresh token is refused as a sign-in token', () => {
  expect(() => verifyAccessToken(signRefreshToken(user))).toThrow(jwt.JsonWebTokenError);
});

test('an expired challenge token is refused', () => {
  const token = signMfaChallengeToken(user);
  const realNow = Date.now;
  Date.now = () => realNow() + 6 * 60 * 1000;
  try {
    expect(() => verifyMfaChallengeToken(token)).toThrow(jwt.TokenExpiredError);
  } finally {
    Date.now = realNow;
  }
});

test('a normal sign-in token still works', () => {
  expect(verifyAccessToken(signAccessToken(user)).sub).toBe(user._id);
});

test('tokens issued in the same second are never identical (random ID per token)', () => {
  const access = [signAccessToken(user), signAccessToken(user)];
  const refresh = [signRefreshToken(user), signRefreshToken(user)];
  const challenge = [signMfaChallengeToken(user), signMfaChallengeToken(user)];
  for (const [a, b] of [access, refresh, challenge]) {
    expect(a).not.toBe(b);
    const [pa, pb] = [jwt.decode(a), jwt.decode(b)];
    expect(pa.iat).toBe(pb.iat);
    expect(pa.jti).toMatch(/^[0-9a-f-]{36}$/);
    expect(pa.jti).not.toBe(pb.jti);
  }
});

test('access and refresh tokens carry the session version; an account without one counts as 0', () => {
  const { tokenVersionOf } = require('../utils/jwt');
  expect(jwt.decode(signAccessToken({ ...user, tokenVersion: 3 })).tv).toBe(3);
  expect(jwt.decode(signRefreshToken({ ...user, tokenVersion: 3 })).tv).toBe(3);
  expect(jwt.decode(signAccessToken(user)).tv).toBe(0);
  expect(tokenVersionOf(undefined)).toBe(0);
  expect(tokenVersionOf(null)).toBe(0);
  expect(tokenVersionOf(2)).toBe(2);
});
