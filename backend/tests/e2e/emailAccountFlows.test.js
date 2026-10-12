// Email restoration: public routes are exercised with isolated data and a mocked sender.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';
const crypto = require('crypto');
const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
let app, env, Users, EmailService, hashPassword, signAccessToken, send;
const password = `Aa1!${crypto.randomBytes(16).toString('hex')}`;
const newPassword = `Bb2!${crypto.randomBytes(16).toString('hex')}`;
let sequence = 0;
beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  env = require('../../config/env');
  Users = require('../../repositories/UserRepository');
  EmailService = require('../../services/EmailService');
  ({ hashPassword } = require('../../utils/password'));
  ({ signAccessToken } = require('../../utils/jwt'));
}, 60000);
beforeEach(() => {
  env.emailAccountFlowsEnabled = true;
  env.emailTransport = 'console';
  env.emailAppUrl = 'https://ledger-onboard.vercel.app';
  env.mfaEncryptionKey = crypto.randomBytes(32);
  send = jest.spyOn(EmailService, 'send').mockResolvedValue({ accepted: ['test-only'] });
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => stopTestDb());
async function user(extra = {}) {
  sequence += 1;
  return Users.create({ firstName: 'Email', lastName: 'Tester', fullName: 'Email Tester',
    email: `email-flows-${crypto.randomUUID()}@gmail.com`, phone: `0917888${String(sequence).padStart(4, '0')}`,
    passwordHash: await hashPassword(password), role: 'tenant', accountStatus: 'active', emailVerified: true,
    emergencyContact: { name: 'Test Contact', phone: '09171234567' }, ...extra });
}
const authed = (path, u) => request(app).post(`/api/auth${path}`).set('Authorization', `Bearer ${signAccessToken(u)}`);
const login = (u, p = password) => request(app).post('/api/auth/login').send({ email: u.email, password: p });
const verify = (challengeToken, code) => request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', challengeToken, code });
const lastCode = () => send.mock.calls.at(-1)?.[0]?.text.match(/Your verification code: (\d{6})/)?.[1];
async function enrolled() {
  const u = await user();
  expect((await authed('/mfa/email/setup', u).send({ password })).status).toBe(200);
  const code = lastCode();
  expect(code).toMatch(/^\d{6}$/);
  expect((await authed('/mfa/email/enable', u).send({ code })).status).toBe(200);
  return u;
}
test('enrollment proves mailbox ownership, hides stored codes, and signs in only after email OTP', async () => {
  const u = await enrolled();
  const profile = await request(app).get('/api/users/me').set('Authorization', `Bearer ${signAccessToken(u)}`);
  expect(profile.body.data.user).toMatchObject({ mfaEnabled: true, mfaMethod: 'email', emailMfaEnrolled: true });
  expect(JSON.stringify(profile.body)).not.toMatch(/codeHash|emailCodes|emailMfaEnabledAt/);
  const first = await login(u);
  expect(first.body.data).toMatchObject({ mfaRequired: true, mfaMethod: 'email' });
  expect(first.body.data.accessToken).toBeUndefined();
  const code = lastCode();
  const completed = await verify(first.body.data.challengeToken, code);
  expect(completed.status).toBe(200);
  expect(completed.body.data.accessToken).toBeTruthy();
  expect((await verify(first.body.data.challengeToken, code)).status).not.toBe(200);
});
test('email setup requires the password and wrong or expired enrollment codes cannot enable it', async () => {
  const u = await user();
  expect((await authed('/mfa/email/setup', u).send({ password: 'incorrect' })).status).toBe(400);
  expect(send).not.toHaveBeenCalled();
  expect((await authed('/mfa/email/setup', u).send({ password })).status).toBe(200);
  const code = lastCode();
  const wrong = code === '000000' ? '111111' : '000000';
  expect((await authed('/mfa/email/enable', u).send({ code: wrong })).status).toBe(400);
  await Users.updateById(u._id, { 'emailCodes.setup.expiresAt': new Date(0) });
  expect((await authed('/mfa/email/enable', u).send({ code })).status).toBe(400);
  expect((await Users.findById(u._id)).mfaEnabled).toBe(false);
});
test('an authenticator enrollment cannot be overwritten by email enrollment', async () => {
  const u = await user();
  const setup = await authed('/mfa/setup', u).send({ password });
  const code = require('../../utils/totp').generateTotp(setup.body.data.secret);
  expect((await authed('/mfa/enable', u).send({ code })).status).toBe(200);
  expect((await authed('/mfa/email/setup', u).send({ password })).status).toBe(409);
  expect((await Users.findById(u._id)).mfaMethod).toBe('totp');
  expect(send).not.toHaveBeenCalled();
});
test('expired login codes, forged challenges and codes bound to another challenge are rejected', async () => {
  const u = await enrolled();
  const first = await login(u);
  const oldCode = lastCode();
  await Users.updateById(u._id, { 'emailCodes.login.issuedAt': new Date(0) });
  const second = await login(u);
  expect(second.status).toBe(200);
  const code = lastCode();
  expect((await verify(first.body.data.challengeToken, oldCode)).status).not.toBe(200);
  expect((await verify('forged', code)).status).toBe(401);
  await Users.updateById(u._id, { 'emailCodes.login.expiresAt': new Date(0) });
  expect((await verify(second.body.data.challengeToken, code)).status).toBe(400);
});
test('resend has a cooldown, invalidates the old code, and never unlocks excessive guesses', async () => {
  const u = await enrolled();
  const first = await login(u);
  const challengeToken = first.body.data.challengeToken;
  const oldCode = lastCode();
  expect((await request(app).post('/api/auth/mfa/email/resend').send({ challengeToken })).status).toBe(429);
  await Users.updateById(u._id, { 'emailCodes.login.issuedAt': new Date(0) });
  expect((await request(app).post('/api/auth/mfa/email/resend').send({ challengeToken })).status).toBe(200);
  const code = lastCode();
  if (code !== oldCode) expect((await verify(challengeToken, oldCode)).status).toBe(400);
  const wrong = code === '000000' ? '111111' : '000000';
  // Every rejected code counts, including the superseded code checked above: five guesses total.
  for (let i = 0; i < (code !== oldCode ? 4 : 5); i += 1) expect((await verify(challengeToken, wrong)).status).toBe(400);
  expect((await verify(challengeToken, code)).status).toBe(429);
  await Users.updateById(u._id, { 'emailCodes.login.issuedAt': new Date(0) });
  expect((await request(app).post('/api/auth/mfa/email/resend').send({ challengeToken })).status).toBe(429);
});
test('simultaneous use of a login code creates just one session', async () => {
  const u = await enrolled();
  const first = await login(u);
  const results = await Promise.all([verify(first.body.data.challengeToken, lastCode()), verify(first.body.data.challengeToken, lastCode())]);
  expect(results.filter(r => r.status === 200)).toHaveLength(1);
});
test('turning email two-factor off needs both a password and a separate settings code', async () => {
  const u = await enrolled();
  expect((await authed('/mfa/disable', u).send({ password })).status).toBe(400);
  expect((await authed('/mfa/email/code', u).send({ password })).status).toBe(200);
  expect((await authed('/mfa/disable', u).send({ password, code: lastCode() })).status).toBe(200);
  expect((await login(u)).body.data.mfaRequired).toBeUndefined();
});
test('forgot password emails a reset code and reset revokes sessions without disabling authenticator settings', async () => {
  const u = await user();
  const session = await login(u);
  const setup = await authed('/mfa/setup', u).send({ password });
  const appCode = require('../../utils/totp').generateTotp(setup.body.data.secret);
  const enabled = await authed('/mfa/enable', u).send({ code: appCode });
  expect(enabled.status).toBe(200);
  const result = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
  expect(result.status).toBe(200);
  const code = lastCode();
  expect(code).toMatch(/^\d{6}$/);
  const reset = await request(app).post('/api/auth/reset-password').send({ email: u.email, code, newPassword });
  expect(reset.status).toBe(200);
  expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${session.body.data.accessToken}`)).status).toBe(401);
  const afterReset = await login(u, newPassword);
  expect(afterReset.body.data.mfaRequired).toBe(true);
  expect((await verify(afterReset.body.data.challengeToken, enabled.body.data.backupCodes[0])).status).toBe(200);
  expect((await Users.findById(u._id)).mfaMethod).toBe('totp');
  expect((await request(app).post('/api/auth/reset-password').send({ email: u.email, code, newPassword: password })).status).toBe(400);
});
test('unknown accounts and delivery failures have the same reset response, with existing recovery still usable', async () => {
  const u = await user();
  const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'not-created-email-flows@gmail.com' });
  send.mockRejectedValue(new Error('synthetic provider outage'));
  const failed = await request(app).post('/api/auth/forgot-password').send({ email: u.email });
  expect(failed.status).toBe(200);
  expect(failed.body.data).toEqual(unknown.body.data);
  expect(send).toHaveBeenCalledTimes(1);
});
test('reset requests do not overwrite login codes or administrator recovery codes', async () => {
  const u = await enrolled();
  const first = await login(u);
  const code = lastCode();
  const adminCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  await Users.updateById(u._id, { otp: { codeHash: await require('../../utils/otp').hashOtp(adminCode), purpose: 'password_reset', expiresAt: new Date(Date.now() + 60000), attempts: 0 } });
  expect((await request(app).post('/api/auth/forgot-password').send({ email: u.email })).status).toBe(200);
  expect((await verify(first.body.data.challengeToken, code)).status).toBe(200);
  expect((await request(app).post('/api/auth/reset-password').send({ email: u.email, code: adminCode, newPassword })).status).toBe(200);
});
test('pending caretaker accounts cannot use forgot password to bypass activation', async () => {
  const u = await user({ role: 'caretaker', accountStatus: 'pending_activation' });
  await request(app).post('/api/auth/forgot-password').send({ email: u.email });
  expect(send).not.toHaveBeenCalled();
});
test('caretaker invitation emails the one-time activation code and deployed link, with no shared password', async () => {
  const landlord = await user({ role: 'landlord' });
  const email = `invited-${crypto.randomUUID()}@gmail.com`;
  const invite = await request(app).post('/api/landlord/caretakers').set('Authorization', `Bearer ${signAccessToken(landlord)}`)
    .send({ firstName: 'Care', lastName: 'Taker', email, phone: '09179998877', serviceBarangay: 'Poblacion Oeste' });
  expect(invite.status).toBe(201);
  expect(send).toHaveBeenCalledTimes(1);
  const body = send.mock.calls[0][0];
  expect(body.to).toBe(email);
  expect(body.text).toContain(invite.body.data.activationCode);
  expect(body.html).toContain('https://ledger-onboard.vercel.app/activate-caretaker');
  expect(body.text).not.toMatch(/temporary password|shared password|localhost/i);
  const activation = await request(app).post('/api/auth/activate-caretaker').send({ email, code: invite.body.data.activationCode, password: newPassword });
  expect(activation.status).toBe(200);
});
test('invitation delivery failures preserve the landlord code and resend emails a fresh code', async () => {
  const landlord = await user({ role: 'landlord' });
  send.mockRejectedValueOnce(new Error('synthetic provider outage'));
  const invite = await request(app).post('/api/landlord/caretakers').set('Authorization', `Bearer ${signAccessToken(landlord)}`)
    .send({ firstName: 'Care', lastName: 'Taker', email: `retry-${crypto.randomUUID()}@gmail.com`, phone: '09179998878', serviceBarangay: 'Poblacion Oeste' });
  expect(invite.status).toBe(201);
  expect(send).toHaveBeenCalledTimes(1);
  const resent = await request(app).post(`/api/landlord/caretakers/${invite.body.data.caretaker._id}/resend-invitation`).set('Authorization', `Bearer ${signAccessToken(landlord)}`);
  expect(resent.status).toBe(200);
  expect(send.mock.calls.at(-1)[0].text).toContain(resent.body.data.activationCode);
  expect(resent.body.data.activationCode).not.toBe(invite.body.data.activationCode);
});
test('disabled email flows never weaken an already enrolled email sign-in', async () => {
  const u = await enrolled();
  env.emailAccountFlowsEnabled = false;
  expect((await login(u)).status).toBe(503);
});
test('a provider outage or wrong password cannot bypass email two-factor or send arbitrary emails', async () => {
  const u = await enrolled();
  send.mockClear();
  expect((await login(u, 'incorrect')).status).toBe(401);
  expect(send).not.toHaveBeenCalled();
  send.mockRejectedValue(new Error('synthetic provider outage'));
  const failed = await login(u);
  expect(failed.status).toBe(400);
  expect(failed.body.error.code).toBe('OTP_EMAIL_DELIVERY_FAILED');
  expect(failed.body.data?.accessToken).toBeUndefined();
  expect((await Users.findById(u._id)).mfaEnabled).toBe(true);
});
test('expired reset codes and repeated wrong guesses cannot reset a password or lock login codes', async () => {
  const u = await enrolled();
  const first = await login(u);
  const loginCode = lastCode();
  await request(app).post('/api/auth/forgot-password').send({ email: u.email });
  const resetCode = lastCode();
  await Users.updateById(u._id, { 'emailCodes.reset.expiresAt': new Date(0) });
  const reset = code => request(app).post('/api/auth/reset-password').send({ email: u.email, code, newPassword });
  expect((await reset(resetCode)).status).toBe(400);
  for (let i = 0; i < 4; i += 1) expect((await reset(resetCode)).status).toBe(400);
  expect((await reset(resetCode)).status).toBe(429);
  expect((await verify(first.body.data.challengeToken, loginCode)).status).toBe(200);
});
test('changing a password invalidates pending email challenges and requires a settings code', async () => {
  const u = await enrolled();
  const first = await login(u);
  const oldChallenge = first.body.data.challengeToken;
  const loginCode = lastCode();
  const change = body => request(app).patch('/api/auth/change-password').set('Authorization', `Bearer ${signAccessToken(u)}`).send(body);
  expect((await change({ currentPassword: password, newPassword })).status).toBe(400);
  expect((await authed('/mfa/email/code', u).send({ password })).status).toBe(200);
  expect((await change({ currentPassword: password, newPassword, code: lastCode() })).status).toBe(200);
  expect((await verify(oldChallenge, loginCode)).status).toBe(401);
});
