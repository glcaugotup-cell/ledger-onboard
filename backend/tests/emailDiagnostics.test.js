jest.mock('dotenv', () => ({ config: jest.fn() }));
let env, Email;
const realFetch = global.fetch;
beforeEach(() => {
  jest.resetModules(); env = require('../config/env'); Email = require('../services/EmailService');
  env.emailTransport = 'brevo'; env.brevoApiKey = 'private-test-key'; env.emailFrom = 'Ledger OnBoard <sender@gmail.com>';
  env.isProduction = true;
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { global.fetch = realFetch; jest.restoreAllMocks(); });
const mail = { to: 'recipient@gmail.com', subject: 'Private subject', text: 'Secret code 123456', html: '<p>123456</p>' };
test('startup reports configuration presence, never credential or message values', () => {
  Email.reportConfiguration();
  const output = JSON.stringify(console.info.mock.calls);
  expect(output).toContain('brevo'); expect(output).toContain('apiKeyConfigured');
  expect(output).not.toMatch(/private-test-key|sender@gmail|recipient@gmail|123456/);
});
test('accepted Brevo requests produce safe diagnostics', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: 'mock-id' }) });
  await Email.send(mail);
  const output = JSON.stringify(console.info.mock.calls);
  expect(output).toContain('accepted'); expect(output).toContain('attempt');
  expect(output).not.toMatch(/private-test-key|recipient@gmail|Private subject|123456/);
});
test.each([
  [401, 'IP address is not authorized private-test-key recipient@gmail.com 123456', 'ip_not_authorized'],
  [401, 'Key not found private-test-key', 'authentication_failed'],
  [400, 'sender not valid recipient@gmail.com', 'sender_invalid'],
  [403, 'Transactional platform not activated', 'sending_not_enabled'],
  [429, 'quota exceeded', 'quota_exceeded'],
])('Brevo rejection %s has an actionable safe reason', async (status, body, reason) => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status, text: async () => body });
  const error = await Email.send(mail).catch(e => e);
  expect(error.emailReason).toBe(reason);
  expect(JSON.stringify(console.error.mock.calls)).toContain(reason);
  expect(error.message + JSON.stringify(console.error.mock.calls)).not.toMatch(/private-test-key|recipient@gmail|123456/);
});
test('an invalid sender or missing key is reported before making a request', async () => {
  env.brevoApiKey = ''; global.fetch = jest.fn();
  await expect(Email.send(mail)).rejects.toThrow('BREVO_API_KEY');
  expect(console.error).toHaveBeenCalled(); expect(global.fetch).not.toHaveBeenCalled();
});
test('production console mode is a skipped send, never logs private contents', async () => {
  env.emailTransport = 'console'; const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  expect(await Email.send(mail)).toEqual({ skipped: true, reason: 'console_in_production' });
  expect(log).not.toHaveBeenCalled();
});
test('malformed Brevo success responses are not reported as accepted mail', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  const error = await Email.send(mail).catch(e => e);
  expect(error.emailReason).toBe('invalid_response');
  expect(JSON.stringify(console.info.mock.calls)).not.toContain('accepted');
});
test('network failures produce an actionable error without echoing private input', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('private-test-key recipient@gmail.com 123456'));
  const error = await Email.send(mail).catch(e => e);
  expect(error.emailReason).toBe('network_error');
  expect(error.message + JSON.stringify(console.error.mock.calls)).not.toMatch(/private-test-key|recipient@gmail|123456/);
});
