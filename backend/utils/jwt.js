const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ALGORITHMS = ['HS256'];

/** Short-lived access token carrying only what RBAC middleware needs. */
function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, accountStatus: user.accountStatus },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: String(user._id), type: 'refresh' }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpiresIn,
  });
}

/**
 * Sign-in tokens never carry a purpose claim. Single-purpose tokens signed with the same
 * secret (e.g. the caretaker activation link) do, so they are refused here.
 */
function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ALGORITHMS });
  if (payload.purpose !== undefined || payload.type !== undefined) {
    throw new jwt.JsonWebTokenError('Not a sign-in token');
  }
  return payload;
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret, { algorithms: ALGORITHMS });
}

// ── Two-factor sign-in challenge ─────────────────────────────────────────
// Issued after a correct password when two-factor is on; exchanged with a code for real tokens.
const MFA_CHALLENGE_PURPOSE = 'mfa_pending';
const MFA_CHALLENGE_TTL = '5m';

// Its own signing key (derived from JWT_SECRET) and purpose claim: a challenge can never pass
// as a sign-in token, and a sign-in token can never pass as a challenge.
function mfaChallengeKey() {
  return crypto.createHmac('sha256', env.jwtSecret).update('ledger-onboard:mfa-challenge').digest();
}

function signMfaChallengeToken(user) {
  return jwt.sign({ sub: String(user._id), purpose: MFA_CHALLENGE_PURPOSE }, mfaChallengeKey(), { expiresIn: MFA_CHALLENGE_TTL });
}

function verifyMfaChallengeToken(token) {
  const payload = jwt.verify(token, mfaChallengeKey(), { algorithms: ALGORITHMS });
  if (payload.purpose !== MFA_CHALLENGE_PURPOSE) throw new jwt.JsonWebTokenError('Not a two-factor challenge');
  return payload;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  signMfaChallengeToken,
  verifyMfaChallengeToken,
  MFA_CHALLENGE_PURPOSE,
};
