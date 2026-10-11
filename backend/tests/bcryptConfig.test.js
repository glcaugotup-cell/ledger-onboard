// Password hashing cost: cheap under Jest (tests/helpers/jestEnv.js), never weak in production.
// Configuration is isolated from the developer's actual .env file.
jest.mock('dotenv', () => ({ config: jest.fn() }));
const previousEnv = { ...process.env };

afterEach(() => {
  process.env = { ...previousEnv };
});

/** Loads config/env fresh, as a server boot would, with the given NODE_ENV and BCRYPT_SALT_ROUNDS. */
function bootEnvWith(nodeEnv, rounds) {
  jest.resetModules();
  process.env.NODE_ENV = nodeEnv;
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused';
  process.env.JWT_SECRET = 'x';
  process.env.JWT_REFRESH_SECRET = 'y';
  if (rounds === undefined) delete process.env.BCRYPT_SALT_ROUNDS;
  else process.env.BCRYPT_SALT_ROUNDS = rounds;
  return require('../config/env');
}

test('Jest runs use the low hashing cost from the setup file', () => {
  jest.resetModules();
  expect(require('../config/env').bcryptSaltRounds).toBe(4);
});

test('production refuses to start with a hashing cost below 10', () => {
  expect(() => bootEnvWith('production', '4')).toThrow('BCRYPT_SALT_ROUNDS must be at least 10 in production (got 4)');
  expect(() => bootEnvWith('production', '9')).toThrow('BCRYPT_SALT_ROUNDS must be at least 10 in production (got 9)');
});

test('production starts with a cost of 10 or more, or with the default of 12', () => {
  expect(bootEnvWith('production', '10').bcryptSaltRounds).toBe(10);
  expect(bootEnvWith('production', '12').bcryptSaltRounds).toBe(12);
  expect(bootEnvWith('production', undefined).bcryptSaltRounds).toBe(12);
});

test('outside production a low cost is allowed (local development and tests)', () => {
  expect(bootEnvWith('development', '4').bcryptSaltRounds).toBe(4);
  expect(bootEnvWith('test', '4').bcryptSaltRounds).toBe(4);
});
