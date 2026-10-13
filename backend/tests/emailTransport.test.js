// Email transports: Brevo over HTTPS (for hosts that block SMTP) and time limits on every real send.
// Configuration is isolated from the developer's actual .env file, and no real email is sent:
// fetch is replaced with a stub, and no SMTP connection is opened.
jest.mock('dotenv', () => ({ config: jest.fn() }));
const previousEnv = { ...process.env };
const realFetch = global.fetch;

let env;
let EmailService;

beforeEach(() => {
  jest.resetModules();
  process.env.NODE_ENV = 'test';
  process.env.CLIENT_ORIGIN = 'https://ledger-onboard.vercel.app';
  process.env.EMAIL_FROM = '"Ledger OnBoard <ledgeronboard@gmail.com>"';
  env = require('../config/env');
  EmailService = require('../services/EmailService');
  // Tests force the console transport; switch per test to the transport under test.
  env.emailTransport = 'brevo';
  env.brevoApiKey = 'test-brevo-key';
  env.emailTimeoutMs = 10000;
});

afterEach(() => {
  process.env = { ...previousEnv };
  global.fetch = realFetch;
});

test('Brevo sends the message over HTTPS with the parsed sender, recipient, subject and both bodies', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: '<abc@brevo>' }) });

  const result = await EmailService.send({ to: 'tenant@gmail.com', subject: 'Hello', text: 'Plain', html: '<p>Rich</p>' });

  expect(result).toEqual({ accepted: ['tenant@gmail.com'], messageId: '<abc@brevo>' });
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('https://api.brevo.com/v3/smtp/email');
  expect(options.method).toBe('POST');
  expect(options.headers['api-key']).toBe('test-brevo-key');
  expect(JSON.parse(options.body)).toEqual({
    sender: { name: 'Ledger OnBoard', email: 'ledgeronboard@gmail.com' },
    to: [{ email: 'tenant@gmail.com' }],
    subject: 'Hello',
    htmlContent: '<p>Rich</p>',
    textContent: 'Plain',
  });
  expect(options.signal).toBeDefined(); // the request carries the time limit
});

test('the real OTP email goes through Brevo with the code in it', async () => {
  // New rule: a successful send must carry Brevo's actual messageId.
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: 'mock-otp-id' }) });
  await EmailService.sendOtpEmail('new.user@gmail.com', '482913', 'email_verification', 'Andrae');
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.subject).toBe('Verify your Ledger OnBoard account');
  expect(body.textContent).toContain('482913');
  expect(body.htmlContent).toContain('482913');
});

test('a Brevo refusal becomes a clear error that never contains the API key', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => '{"message":"sender not valid"}' });
  const error = await EmailService.send({ to: 'a@gmail.com', subject: 'S', text: 'T' }).catch((e) => e);
  expect(error.message).toMatch(/Brevo rejected the email \(HTTP 400\).*sender not valid/);
  expect(error.message).not.toContain('test-brevo-key');
});

test('a missing Brevo API key fails immediately with a clear message', async () => {
  env.brevoApiKey = '';
  global.fetch = jest.fn();
  await expect(EmailService.send({ to: 'a@gmail.com', subject: 'S', text: 'T' })).rejects.toThrow('BREVO_API_KEY is not set');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('an unresponsive email service fails after the time limit instead of hanging the request', async () => {
  env.emailTimeoutMs = 50;
  // Never answers; only the time-limit signal can end it.
  global.fetch = jest.fn((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))));

  const started = Date.now();
  await expect(EmailService.send({ to: 'a@gmail.com', subject: 'S', text: 'T' })).rejects.toThrow('Brevo did not respond within 50 ms');
  expect(Date.now() - started).toBeLessThan(2000);
});

test('the SMTP transport has connection, greeting and socket time limits', () => {
  env.emailTransport = 'smtp';
  env.emailTimeoutMs = 7000;
  Object.assign(env.smtp, { host: 'smtp.example.com', port: 587, user: 'u', pass: 'p' });
  const transporter = EmailService._getTransporter();
  expect(transporter.options).toMatchObject({ connectionTimeout: 7000, greetingTimeout: 7000, socketTimeout: 7000 });
});

test('the none transport returns at once without sending, connecting or logging anything', async () => {
  env.emailTransport = 'none';
  global.fetch = jest.fn();
  const logSpy = jest.spyOn(console, 'log');
  const errorSpy = jest.spyOn(console, 'error');

  const started = Date.now();
  const result = await EmailService.send({ to: 'a@gmail.com', subject: 'S', text: 'Your code is 482913' });
  const otpResult = await EmailService.sendOtpEmail('new.user@gmail.com', '482913', 'email_verification', 'Andrae');

  expect(result).toEqual({ skipped: true, reason: 'transport_disabled' });
  expect(otpResult).toEqual({ skipped: true, reason: 'transport_disabled' });
  expect(Date.now() - started).toBeLessThan(1000);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(EmailService._transporter).toBeNull(); // no SMTP connection was set up
  expect(logSpy).not.toHaveBeenCalled();
  expect(errorSpy).not.toHaveBeenCalled();
  logSpy.mockRestore();
  errorSpy.mockRestore();
});

/** Loads config/env fresh, as a real (non-test) server boot would, with the given EMAIL_TRANSPORT. */
function bootEnvWith(transport) {
  jest.resetModules();
  process.env.NODE_ENV = 'development';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused';
  process.env.JWT_SECRET = 'x';
  process.env.JWT_REFRESH_SECRET = 'y';
  process.env.EMAIL_TRANSPORT = transport;
  return require('../config/env');
}

test('an unknown EMAIL_TRANSPORT (a typo like "smpt") stops the server from starting', () => {
  expect(() => bootEnvWith('smpt')).toThrow('EMAIL_TRANSPORT must be one of: console, brevo, smtp, none (got "smpt")');
  // The app loads config/env before anything else, so the same typo keeps the whole app from loading.
  jest.resetModules();
  expect(() => require('../app')).toThrow(/EMAIL_TRANSPORT must be one of/);
});

test('the four supported transports are accepted, case-insensitively', () => {
  expect(bootEnvWith('none').emailTransport).toBe('none');
  expect(bootEnvWith(' SMTP ').emailTransport).toBe('smtp');
  expect(bootEnvWith('console').emailTransport).toBe('console');
  expect(bootEnvWith('brevo').emailTransport).toBe('brevo');
});

test('the default time limit is 10 seconds, and EMAIL_TRANSPORT is read case-insensitively', () => {
  jest.resetModules();
  process.env.NODE_ENV = 'development';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/unused';
  process.env.JWT_SECRET = 'x';
  process.env.JWT_REFRESH_SECRET = 'y';
  process.env.EMAIL_TRANSPORT = ' Brevo ';
  delete process.env.EMAIL_TIMEOUT_MS;
  const freshEnv = require('../config/env');
  expect(freshEnv.emailTransport).toBe('brevo');
  expect(freshEnv.emailTimeoutMs).toBe(10000);
});
