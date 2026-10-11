// MFA_ENCRYPTION_KEY: required in production, optional elsewhere, always well-formed when set.
// Configuration is isolated from the developer's actual .env file; keys are random per run.
jest.mock('dotenv', () => ({ config: jest.fn() }));
const crypto = require('crypto');

const previousEnv = { ...process.env };

afterEach(() => {
  process.env = { ...previousEnv };
});

/** Loads config/env fresh, as a server boot would. `key` undefined = unset. */
function bootEnvWith(nodeEnv, key) {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused';
  process.env.JWT_SECRET = 'x';
  process.env.JWT_REFRESH_SECRET = 'y';
  delete process.env.BCRYPT_SALT_ROUNDS; // production also refuses a low hashing cost
  if (key === undefined) delete process.env.MFA_ENCRYPTION_KEY;
  else process.env.MFA_ENCRYPTION_KEY = key;
  return require('../config/env');
}

test('production refuses to start without MFA_ENCRYPTION_KEY', () => {
  expect(() => bootEnvWith('production', undefined)).toThrow('MFA_ENCRYPTION_KEY is required in production');
  expect(() => bootEnvWith('production', '   ')).toThrow('MFA_ENCRYPTION_KEY is required in production');
});

test('production starts with a valid 32-byte key', () => {
  const key = crypto.randomBytes(32);
  expect(bootEnvWith('production', key.toString('base64')).mfaEncryptionKey.equals(key)).toBe(true);
});

test('a malformed key stops the server in any environment', () => {
  for (const nodeEnv of ['production', 'development', 'test']) {
    expect(() => bootEnvWith(nodeEnv, crypto.randomBytes(16).toString('base64'))).toThrow('MFA_ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
    expect(() => bootEnvWith(nodeEnv, 'not-a-key')).toThrow('MFA_ENCRYPTION_KEY must be 32 random bytes, base64-encoded');
  }
});

test('outside production the key is optional (two-factor setup is then unavailable)', () => {
  expect(bootEnvWith('development', undefined).mfaEncryptionKey).toBeNull();
});
