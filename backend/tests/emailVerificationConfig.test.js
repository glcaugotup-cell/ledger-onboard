// EMAIL_VERIFICATION_REQUIRED: sign-up email verification is off unless explicitly turned on.
// Configuration is isolated from the developer's actual .env file.
jest.mock('dotenv', () => ({ config: jest.fn() }));
const previousEnv = { ...process.env };

afterEach(() => {
  process.env = { ...previousEnv };
});

/** Loads config/env fresh, as a server boot would, with the given EMAIL_VERIFICATION_REQUIRED (undefined = unset). */
function bootEnvWith(value) {
  jest.resetModules();
  process.env.NODE_ENV = 'development';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused';
  process.env.JWT_SECRET = 'x';
  process.env.JWT_REFRESH_SECRET = 'y';
  if (value === undefined) delete process.env.EMAIL_VERIFICATION_REQUIRED;
  else process.env.EMAIL_VERIFICATION_REQUIRED = value;
  return require('../config/env');
}

test('verification is off by default (unset or empty)', () => {
  expect(bootEnvWith(undefined).emailVerificationRequired).toBe(false);
  expect(bootEnvWith('').emailVerificationRequired).toBe(false);
});

test('true turns it on and false keeps it off, case-insensitively', () => {
  expect(bootEnvWith('true').emailVerificationRequired).toBe(true);
  expect(bootEnvWith(' TRUE ').emailVerificationRequired).toBe(true);
  expect(bootEnvWith('false').emailVerificationRequired).toBe(false);
});

test('any other value stops the server from starting', () => {
  expect(() => bootEnvWith('yes')).toThrow('EMAIL_VERIFICATION_REQUIRED must be true or false (got "yes")');
  expect(() => bootEnvWith('ture')).toThrow('EMAIL_VERIFICATION_REQUIRED must be true or false (got "ture")');
});
