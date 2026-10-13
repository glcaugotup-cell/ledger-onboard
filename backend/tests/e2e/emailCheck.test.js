// Main admin "Send test email": reports accepted / skipped / failed with a plain fix, never secrets.
// Brevo is mocked; no real email is sent.
const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;
let env;
let UserRepository;
let hashPassword;
let signAccessToken;
let main;
let other;
const previousFetch = global.fetch;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  env = require('../../config/env');
  UserRepository = require('../../repositories/UserRepository');
  ({ hashPassword } = require('../../utils/password'));
  ({ signAccessToken } = require('../../utils/jwt'));
  const make = async (email, phone) => UserRepository.create({
    firstName: 'Check', lastName: 'Admin', fullName: 'Check Admin', email, phone,
    passwordHash: await hashPassword('Str0ng!Pass'), role: 'admin', accountStatus: 'active',
  });
  main = await make('ledgeronboard@gmail.com', '09174440001');
  other = await make('other.check@gmail.com', '09174440002');
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

const saved = {};
beforeEach(() => {
  Object.assign(saved, { emailTransport: env.emailTransport, brevoApiKey: env.brevoApiKey, emailFrom: env.emailFrom });
  env.emailFrom = 'Ledger OnBoard <sender@gmail.com>';
});
afterEach(() => {
  Object.assign(env, saved);
  global.fetch = previousFetch;
  jest.restoreAllMocks();
});

const check = (user) => request(app).post('/api/admin/email-test').set('Authorization', `Bearer ${signAccessToken(user)}`);

test('only the main admin can run it', async () => {
  const res = await check(other);
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('MAIN_ADMIN_REQUIRED');
});

test('sending switched off on the server is reported with the setting to change', async () => {
  env.emailTransport = 'none';
  const res = await check(main);
  expect(res.status).toBe(200);
  expect(res.body.data).toMatchObject({ status: 'skipped', reason: 'transport_disabled', transport: 'none', to: 'ledgeronboard@gmail.com' });
  expect(res.body.data.advice).toContain('EMAIL_TRANSPORT=brevo');
});

test('a missing API key is reported before Brevo is called', async () => {
  env.emailTransport = 'brevo';
  env.brevoApiKey = '';
  global.fetch = jest.fn();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await check(main);
  expect(res.body.data).toMatchObject({ status: 'failed', reason: 'missing_api_key', apiKeyConfigured: false });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a Brevo rejection is classified, and the key itself never appears in the answer', async () => {
  env.emailTransport = 'brevo';
  env.brevoApiKey = 'xkeysib-secret-value';
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '{"code":"unauthorized","message":"Key not found"}' });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const res = await check(main);
  expect(res.body.data).toMatchObject({ status: 'failed', reason: 'authentication_failed', apiKeyConfigured: true, senderEmail: 'sender@gmail.com' });
  expect(res.body.data.advice).toMatch(/API key/);
  expect(JSON.stringify(res.body)).not.toContain('xkeysib-secret-value');
});

test('an accepted email is reported as accepted', async () => {
  env.emailTransport = 'brevo';
  env.brevoApiKey = 'xkeysib-secret-value';
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: '<check@brevo>' }) });
  const res = await check(main);
  expect(res.body.data).toMatchObject({ status: 'accepted', reason: 'accepted' });
  expect(JSON.parse(global.fetch.mock.calls[0][1].body).to).toEqual([{ email: 'ledgeronboard@gmail.com' }]);
});
