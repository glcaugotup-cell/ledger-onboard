// New email policy: isolated MongoDB and mocked delivery; never sends real email.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';
const crypto = require('crypto');
const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
let app, env, Users, Email, hashPassword, signAccessToken, send;
const password = 'Policy1!Password';
let sequence = 0;
beforeAll(async () => {
  await startTestDb();
  app = require('../../app'); env = require('../../config/env');
  Users = require('../../repositories/UserRepository'); Email = require('../../services/EmailService');
  ({ hashPassword } = require('../../utils/password')); ({ signAccessToken } = require('../../utils/jwt'));
}, 60000);
beforeEach(() => {
  env.emailAccountFlowsEnabled = true; env.emailMfaEnrollmentEnabled = true;
  env.emailTransport = 'console'; env.emailVerificationRequired = false;
  env.emailAppUrl = 'https://ledger-onboard.vercel.app';
  send = jest.spyOn(Email, 'send').mockResolvedValue({ accepted: ['mock-only'] });
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => stopTestDb());
async function user(extra = {}) {
  sequence += 1;
  return Users.create({ firstName: 'Policy', lastName: 'Tester', fullName: 'Policy Tester',
    email: `policy-${crypto.randomUUID()}@gmail.com`, phone: `0917777${String(sequence).padStart(4, '0')}`,
    passwordHash: await hashPassword(password), role: 'tenant', accountStatus: 'active', emailVerified: true,
    emergencyContact: { name: 'Test Contact', phone: '09171234567' }, ...extra });
}
const post = (path, u, body) => request(app).post(`/api/auth${path}`).set('Authorization', `Bearer ${signAccessToken(u)}`).send(body);
const lastCode = () => send.mock.calls.at(-1)?.[0]?.text.match(/Your verification code: (\d{6})/)?.[1];
const requestCode = u => post('/notifications/email/request', u, { password });
const confirm = (u, code) => post('/notifications/email/confirm', u, { code });

test('notification setup requires authentication and a current password', async () => {
  expect((await request(app).post('/api/auth/notifications/email/request').send({ password })).status).toBe(401);
  const u = await user();
  expect((await post('/notifications/email/request', u, { password: 'wrong' })).status).toBe(400);
  expect(send).not.toHaveBeenCalled();
});
test('a migration-verified account must confirm its inbox before enabling notifications', async () => {
  const u = await user();
  const patch = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${signAccessToken(u)}`)
    .send({ notificationPreferences: { email: true } });
  expect(patch.status).toBe(400);
  expect(patch.body.error.code).toBe('EMAIL_CONFIRMATION_REQUIRED');
  expect((await requestCode(u)).status).toBe(200);
  const code = lastCode(); expect(code).toMatch(/^\d{6}$/);
  const stored = await Users.findByIdWithSecrets(u._id);
  expect(stored.emailCodes.notifications.codeHash).not.toBe(code);
  expect((await confirm(u, code)).body.data.user).toMatchObject({ emailNotificationsConfirmed: true, notificationPreferences: { email: true } });
  expect((await confirm(u, code)).status).toBe(400);
});
test('notification codes cannot be used to reset a password', async () => {
  const u = await user(); await requestCode(u);
  const code = lastCode();
  expect((await request(app).post('/api/auth/reset-password').send({ email: u.email, code, newPassword: 'Other1!Password' })).status).toBe(400);
  expect((await confirm(u, code)).status).toBe(200);
});
test('wrong-code limits survive resends and do not mark the inbox confirmed', async () => {
  const u = await user(); await requestCode(u); const code = lastCode();
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) expect((await confirm(u, wrong)).status).toBe(400);
  expect((await requestCode(u)).status).toBe(429);
  expect((await confirm(u, code)).status).toBe(429);
  expect((await Users.findById(u._id)).emailConfirmedAt).toBeFalsy();
});
test('confirmation codes expire and cannot survive a session-version change', async () => {
  const u = await user(); await requestCode(u); const code = lastCode();
  await Users.updateById(u._id, { 'emailCodes.notifications.expiresAt': new Date(0) });
  expect((await confirm(u, code)).status).toBe(400);
  await Users.updateById(u._id, { 'emailCodes.notifications.issuedAt': new Date(0) });
  await requestCode(u); const next = lastCode();
  await Users.updateById(u._id, { $inc: { tokenVersion: 1 } });
  const latest = await Users.findById(u._id);
  expect((await confirm(latest, next)).status).toBe(400);
});
test('provider failure and unavailable transport never enable notification email', async () => {
  const u = await user(); send.mockRejectedValueOnce(new Error('synthetic outage'));
  expect((await requestCode(u)).body.error.code).toBe('OTP_EMAIL_DELIVERY_FAILED');
  expect((await Users.findById(u._id)).emailConfirmedAt).toBeFalsy();
  env.emailTransport = 'none';
  expect((await requestCode(u)).status).toBe(503);
});
test('closing email two-factor enrollment does not weaken existing sign-in', async () => {
  env.emailMfaEnrollmentEnabled = false;
  const u = await user();
  expect((await post('/mfa/email/setup', u, { password })).status).toBe(410);
  expect((await post('/mfa/email/enable', u, { code: '123456' })).status).toBe(410);
  expect(send).not.toHaveBeenCalled();
  await Users.updateById(u._id, { mfaEnabled: true, mfaMethod: 'email', emailMfaEnabledAt: new Date() });
  const login = await request(app).post('/api/auth/login').send({ email: u.email, password });
  expect(login.body.data).toMatchObject({ mfaRequired: true, mfaMethod: 'email' });
  expect(login.body.data.accessToken).toBeUndefined();
  const code = lastCode();
  expect((await request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', challengeToken: login.body.data.challengeToken, code })).status).toBe(200);
});
test('turning notifications off preserves in-app preference and mailbox proof', async () => {
  const u = await user({ emailConfirmedAt: new Date(), notificationPreferences: { email: true, inApp: true } });
  const result = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${signAccessToken(u)}`)
    .send({ notificationPreferences: { email: false } });
  expect(result.body.data.user.notificationPreferences).toEqual({ email: false, inApp: true });
  expect(result.body.data.user.emailNotificationsConfirmed).toBe(true);
});
test('inactivity warning and archived notice reach confirmed inboxes only', async () => {
  const service = require('../../services/AccountLifecycleService');
  const legacy = await user(); await service._warnUser(legacy, new Date()); expect(send).not.toHaveBeenCalled();
  const confirmed = await user({ emailConfirmedAt: new Date(), notificationPreferences: { email: true } });
  await service._warnUser(confirmed, new Date()); expect(send).toHaveBeenCalledTimes(1);
  send.mockClear(); await service._archiveUser(legacy); expect(send).not.toHaveBeenCalled();
  await service._archiveUser(confirmed); expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].subject).toContain('archived');
  expect((await Users.findById(confirmed._id)).accountStatus).toBe('archived');
});
test('password changes notify confirmed inboxes even when routine notifications are off', async () => {
  const u = await user({ emailConfirmedAt: new Date(), notificationPreferences: { email: false } });
  const result = await request(app).patch('/api/auth/change-password').set('Authorization', `Bearer ${signAccessToken(u)}`)
    .send({ currentPassword: password, newPassword: 'Other1!Password' });
  expect(result.status).toBe(200); expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].text).toContain('Your password was changed');
});
test('a failed security notice does not undo a password change', async () => {
  const u = await user({ emailConfirmedAt: new Date() }); send.mockRejectedValueOnce(new Error('synthetic outage'));
  const result = await request(app).patch('/api/auth/change-password').set('Authorization', `Bearer ${signAccessToken(u)}`)
    .send({ currentPassword: password, newPassword: 'Other1!Password' });
  expect(result.status).toBe(200); expect(send).toHaveBeenCalledTimes(1);
  expect((await request(app).post('/api/auth/login').send({ email: u.email, password: 'Other1!Password' })).status).toBe(200);
});
test('both bill reminder stages email a confirmed inbox once each', async () => {
  const Billing = require('../../models/BillingSOA'); const Notification = require('../../models/Notification');
  const u = await user({ emailConfirmedAt: new Date(), notificationPreferences: { email: true } });
  const due = new Date('2026-11-15T04:00:00Z');
  const soa = await Billing.create({ tenantId: u._id, roomId: new (require('mongoose').Types.ObjectId)(),
    billingPeriod: new Date('2026-11-01'), baseRent: 2000, totalAmountDue: 2000, remainingBalance: 2000, dueDate: due });
  const service = require('../../services/BillingReminderService');
  await service.runForTenant(u._id, new Date('2026-11-08T04:00:00Z')); expect(send).toHaveBeenCalledTimes(1);
  await service.runForTenant(u._id, new Date('2026-11-12T04:00:00Z')); expect(send).toHaveBeenCalledTimes(2);
  await service.runForTenant(u._id, new Date('2026-11-12T04:00:00Z')); expect(send).toHaveBeenCalledTimes(2);
  expect(await Notification.countDocuments({ userId: u._id, relatedId: soa._id })).toBe(2);
});
test('a confirmed reservation approval reaches the Brevo API; legacy unconfirmed inboxes are skipped', async () => {
  const landlord = await user({ role: 'landlord' });
  const tenant = await user({ emailConfirmedAt: new Date(), notificationPreferences: { email: true } });
  const legacy = await user();
  const Property = require('../../models/Property'); const Room = require('../../models/Room');
  const Reservation = require('../../models/Reservation');
  const property = await Property.create({ landlordId: landlord._id, propertyName: 'Policy House',
    address: { street: 'Test St', barangay: 'Poblacion Oeste', city: 'Dagupan City', province: 'Pangasinan' },
    locationCoordinates: { lat: 16.04, lng: 120.33 }, propertyType: 'Bedspace', tenantGenderPolicy: 'Co-Ed', listingStatus: 'approved' });
  const room = await Room.create({ propertyId: property._id, roomNumber: '1', capacity: 3, currentOccupancy: 0, monthlyBaseRent: 2000 });
  const previousFetch = global.fetch;
  send.mockRestore(); env.emailTransport = 'brevo'; env.brevoApiKey = 'mock-private-key'; env.emailFrom = 'Ledger OnBoard <sender@gmail.com>';
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: 'mock-approval-id' }) });
  try {
    for (const person of [tenant, legacy]) {
      const r = await Reservation.create({ tenantId: person._id, propertyId: property._id, roomId: room._id, moveInDate: new Date(Date.now() + 7 * 86400000) });
      const result = await request(app).patch(`/api/reservations/${r._id}/status`).set('Authorization', `Bearer ${signAccessToken(landlord)}`).send({ status: 'approved' });
      expect(result.status).toBe(200); expect(result.body.data.reservation.status).toBe('approved');
    }
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0]; expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    const body = JSON.parse(options.body); expect(body.to).toEqual([{ email: tenant.email }]);
    expect(body.htmlContent).toContain('https://ledger-onboard.vercel.app/tenant/reservations');
  } finally { global.fetch = previousFetch; }
});
test('registration delivery cannot silently succeed when sending is disabled', async () => {
  const service = require('../../services/AuthService');
  const u = await user(); env.emailTransport = 'none'; send.mockRestore();
  await expect(service._issueOtp(u, 'email_verification')).rejects.toMatchObject({ code: 'OTP_EMAIL_DELIVERY_FAILED' });
});
test('clients cannot forge the mailbox-confirmation marker through profile updates', async () => {
  const u = await user();
  const result = await request(app).patch('/api/users/me').set('Authorization', `Bearer ${signAccessToken(u)}`)
    .send({ emailConfirmedAt: new Date().toISOString(), notificationPreferences: { email: true } });
  expect(result.status).toBe(400); expect((await Users.findById(u._id)).emailConfirmedAt).toBeFalsy();
});
test('only important notifications are emailed; the rest stay in-app', async () => {
  const Notifications = require('../../services/NotificationService'); const Notification = require('../../models/Notification');
  const u = await user({ emailConfirmedAt: new Date() });
  await Notifications.notify({ userId: u._id, type: 'MAINTENANCE_ISSUE_UPDATED', title: 'Issue updated', message: 'An update.' });
  expect(send).not.toHaveBeenCalled();
  await Notifications.notify({ userId: u._id, type: 'BILL_CREATED', title: 'New bill', message: 'Your bill is ready.', link: '/tenant/apartment' });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toMatchObject({ to: u.email, subject: 'Ledger OnBoard — New bill' });
  expect(await Notification.countDocuments({ userId: u._id })).toBe(2);
});
test('routine email carries a signed one-click unsubscribe link; security notices do not', async () => {
  env.publicApiUrl = 'https://api.example.test';
  try {
    const Notifications = require('../../services/NotificationService');
    const u = await user({ emailConfirmedAt: new Date() });
    await Notifications.notify({ userId: u._id, type: 'BILL_CREATED', title: 'New bill', message: 'Your bill is ready.' });
    const { unsubscribeUrl, text, html } = send.mock.calls[0][0];
    const parsed = new URL(unsubscribeUrl);
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://api.example.test/api/notifications/unsubscribe');
    expect(parsed.searchParams.get('u')).toBe(String(u._id)); expect(parsed.searchParams.get('t')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(text).toContain(unsubscribeUrl); expect(html).toContain('Unsubscribe from these emails');
    send.mockClear();
    await request(app).patch('/api/auth/change-password').set('Authorization', `Bearer ${signAccessToken(u)}`)
      .send({ currentPassword: password, newPassword: 'Other1!Password' });
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0].unsubscribeUrl).toBeUndefined();
  } finally { env.publicApiUrl = null; }
});
test('Brevo receives the List-Unsubscribe headers', async () => {
  const previousFetch = global.fetch;
  send.mockRestore(); env.emailTransport = 'brevo'; env.brevoApiKey = 'mock-private-key'; env.emailFrom = 'Ledger OnBoard <sender@gmail.com>';
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ messageId: 'mock-id' }) });
  try {
    await Email.send({ to: 'someone@gmail.com', subject: 'Hi', text: 'Hi', unsubscribeUrl: 'https://api.example.test/u' });
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).headers).toEqual({
      'List-Unsubscribe': '<https://api.example.test/u>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    await Email.send({ to: 'someone@gmail.com', subject: 'Code', text: 'Code' });
    expect(JSON.parse(global.fetch.mock.calls[1][1].body).headers).toBeUndefined();
  } finally { global.fetch = previousFetch; }
});
test('unsubscribe links: GET only confirms, POST turns email off, forged links do nothing', async () => {
  env.publicApiUrl = 'https://api.example.test';
  try {
    const { unsubscribeUrl } = require('../../utils/unsubscribe');
    const u = await user({ emailConfirmedAt: new Date(), notificationPreferences: { email: true, inApp: true } });
    const other = await user({ emailConfirmedAt: new Date(), notificationPreferences: { email: true, inApp: true } });
    const path = new URL(unsubscribeUrl(u._id)); const link = `${path.pathname}${path.search}`;
    const shown = await request(app).get(link);
    expect(shown.status).toBe(200); expect(shown.text).toContain('Stop email notifications?');
    expect((await Users.findById(u._id)).notificationPreferences.email).toBe(true);
    const forged = link.replace(String(u._id), String(other._id));
    expect((await request(app).post(forged).type('form').send('List-Unsubscribe=One-Click')).status).toBe(400);
    expect((await request(app).get(`/api/notifications/unsubscribe?u=${other._id}&t=x`)).status).toBe(400);
    expect((await Users.findById(other._id)).notificationPreferences.email).toBe(true);
    const done = await request(app).post(link).type('form').send('List-Unsubscribe=One-Click');
    expect(done.status).toBe(200); expect(done.text).toContain('You are unsubscribed');
    const after = await Users.findById(u._id);
    expect(after.notificationPreferences).toMatchObject({ email: false, inApp: true }); expect(after.emailConfirmedAt).toBeTruthy();
  } finally { env.publicApiUrl = null; }
});
