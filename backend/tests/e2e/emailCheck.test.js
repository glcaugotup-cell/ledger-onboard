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
  Object.assign(saved, { emailTransport: env.emailTransport, brevoApiKey: env.brevoApiKey, emailFrom: env.emailFrom, gmail: { ...env.gmail } });
  require('../../services/EmailService')._gmailToken = null;
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

describe('Gmail API transport (HTTPS, no SMTP)', () => {
  const useGmail = (creds = { clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'refresh-token' }) => {
    env.emailTransport = 'gmail';
    env.emailFrom = 'Ledger OnBoard <ledgeronboard@gmail.com>';
    env.gmail = creds;
  };
  const tokenOk = { ok: true, status: 200, json: async () => ({ access_token: 'access-1', expires_in: 3600 }) };
  const sentOk = { ok: true, status: 200, json: async () => ({ id: 'gmail-msg-1' }) };

  test('missing credentials are reported before Google is called', async () => {
    useGmail({ clientId: '', clientSecret: '', refreshToken: '' });
    global.fetch = jest.fn();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await check(main);
    expect(res.body.data).toMatchObject({ status: 'failed', reason: 'missing_gmail_credentials', gmailConfigured: false });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('a revoked or expired refresh token is reported as gmail_auth_failed, without leaking it', async () => {
    useGmail();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await check(main);
    expect(res.body.data).toMatchObject({ status: 'failed', reason: 'gmail_auth_failed', gmailConfigured: true });
    expect(res.body.data.advice).toMatch(/refresh token/);
    expect(JSON.stringify(res.body)).not.toMatch(/refresh-token|client-secret/);
  });

  test('sends a complete email through the Gmail API and reuses the access token', async () => {
    useGmail();
    global.fetch = jest.fn().mockResolvedValueOnce(tokenOk).mockResolvedValue(sentOk);
    const Email = require('../../services/EmailService');
    const result = await Email.send({ to: 'tenant@gmail.com', subject: 'New bill', text: 'Your bill is ready.', html: '<p>Your bill is ready.</p>', unsubscribeUrl: 'https://api.example.test/u' });
    expect(result).toEqual({ accepted: ['tenant@gmail.com'], messageId: 'gmail-msg-1' });

    const [tokenUrl, tokenRequest] = global.fetch.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    expect(String(tokenRequest.body)).toContain('grant_type=refresh_token');
    const [sendUrl, sendRequest] = global.fetch.mock.calls[1];
    expect(sendUrl).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(sendRequest.headers.authorization).toBe('Bearer access-1');
    const mime = Buffer.from(JSON.parse(sendRequest.body).raw, 'base64url').toString();
    expect(mime).toContain('To: tenant@gmail.com');
    expect(mime).toContain('From: Ledger OnBoard <ledgeronboard@gmail.com>');
    expect(mime).toContain('Subject: New bill');
    expect(mime).toContain('List-Unsubscribe: <https://api.example.test/u>');

    await Email.send({ to: 'other@gmail.com', subject: 'Again', text: 'x' });
    expect(global.fetch).toHaveBeenCalledTimes(3); // one token, two sends
  });

  test('the test email check reports Gmail success', async () => {
    useGmail();
    global.fetch = jest.fn().mockResolvedValueOnce(tokenOk).mockResolvedValue(sentOk);
    const res = await check(main);
    expect(res.body.data).toMatchObject({ status: 'accepted', transport: 'gmail', gmailConfigured: true });
  });
});
