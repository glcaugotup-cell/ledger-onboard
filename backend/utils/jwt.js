const jwt = require('jsonwebtoken');
const env = require('../config/env');

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

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwtRefreshSecret);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
