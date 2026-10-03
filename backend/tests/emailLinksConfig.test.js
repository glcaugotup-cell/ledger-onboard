// These checks isolate configuration from the developer's actual .env file.
jest.mock('dotenv', () => ({ config: jest.fn() }));
const previousEnv = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.CLIENT_ORIGIN = 'http://localhost:5173,https://other.example.com';
  process.env.EMAIL_APP_URL = '';
});
afterEach(() => { process.env = { ...previousEnv }; });

test('public email links use the deployed origin while local CORS origins stay intact', () => {
  process.env.EMAIL_APP_URL = 'https://ledger-onboard.vercel.app/';
  const env = require('../config/env');
  expect(env.emailAppUrl).toBe('https://ledger-onboard.vercel.app');
  expect(env.clientOrigins).toEqual(['http://localhost:5173', 'https://other.example.com']);
});

test('entirely local setups retain localhost links when no public email URL is set', () => {
  const env = require('../config/env');
  expect(env.emailAppUrl).toBe('http://localhost:5173');
});

test('invalid public URL protocols fail at startup instead of reaching invitation recipients', () => {
  process.env.EMAIL_APP_URL = 'javascript:alert(1)';
  expect(() => require('../config/env')).toThrow(/EMAIL_APP_URL must be an http\(s\)/);
});
