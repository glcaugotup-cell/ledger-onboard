// Session versions: a password change or reset (and suspension, deactivation, archiving) ends every
// other session at once; the device that changed the password stays signed in with fresh tokens;
// tokens from before this feature (no version claim) keep working until the version changes.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;
let env;
let UserRepository;
let AuditLogRepository;
let hashPassword;
let generateTotp;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  env = require('../../config/env');
  UserRepository = require('../../repositories/UserRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  ({ hashPassword } = require('../../utils/password'));
  ({ generateTotp } = require('../../utils/totp'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const PASSWORD = 'Str0ng!Pass';
const NEW_PASSWORD = 'N3w!Password';
let phoneSeq = 0;

async function makeUser(email, extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Session', lastName: 'User', fullName: 'Session User', email,
    phone: `0917999${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role: 'tenant', accountStatus: 'active',
    emergencyContact: { name: 'Ana Tenant', phone: '09171234598' },
    ...extra,
  });
}

const login = async (email, password = PASSWORD) => (await request(app).post('/api/auth/login').send({ email, password })).body.data;
const me = (token) => request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
const refresh = (refreshToken) => request(app).post('/api/auth/refresh').send({ refreshToken });
const changePassword = (token, body) => request(app).patch('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send(body);
const codeAt = (secret, steps = 0) => generateTotp(secret, { nowMs: Date.now() + steps * 30000 });

let adminToken;
async function adminSession() {
  if (!adminToken) {
    await makeUser('session.admin@gmail.com', { role: 'admin', emergencyContact: undefined });
    adminToken = (await login('session.admin@gmail.com')).accessToken;
  }
  return adminToken;
}

/** Expects the other device to be fully signed out: its access token and its refresh token. */
async function expectSignedOut(session) {
  const access = await me(session.accessToken);
  expect(access.status).toBe(401);
  expect(access.body.error.code).toBe('SESSION_REVOKED');
  expect((await refresh(session.refreshToken)).status).toBe(401);
}

describe('password change', () => {
  test('signs the other device out at once and keeps the changing device signed in with fresh tokens', async () => {
    await makeUser('change.devices@gmail.com');
    const other = await login('change.devices@gmail.com'); // e.g. a phone
    const changing = await login('change.devices@gmail.com'); // the laptop making the change
    // Before the change both devices' access tokens work (the newest sign-in holds the refresh token).
    expect((await me(other.accessToken)).status).toBe(200);
    expect((await me(changing.accessToken)).status).toBe(200);

    const res = await changePassword(changing.accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    const fresh = res.body.data;
    expect(fresh.accessToken).toBeTruthy();
    expect(fresh.refreshToken).toBeTruthy();
    expect(fresh.user.tokenVersion).toBeUndefined();
    await expectSignedOut(other);
    // The changing device carries on with the fresh tokens.
    expect((await me(fresh.accessToken)).status).toBe(200);
    expect((await refresh(fresh.refreshToken)).status).toBe(200);
    // Its own pre-change token is retired too; only the fresh one counts.
    expect((await me(changing.accessToken)).body.error.code).toBe('SESSION_REVOKED');

    const user = await UserRepository.findByEmail('change.devices@gmail.com');
    expect(user.tokenVersion).toBe(1);
    expect((await AuditLogRepository.findRecent({ action: 'PASSWORD_CHANGED' })).some((l) => String(l.targetId) === String(user._id))).toBe(true);
  }, 30000);

  test('needs the current password, and with two-factor on, an app or backup code too', async () => {
    await makeUser('change.mfa@gmail.com');
    const { accessToken } = await login('change.mfa@gmail.com');
    const { secret } = (await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${accessToken}`).send({ password: PASSWORD })).body.data;
    const { backupCodes } = (await request(app).post('/api/auth/mfa/enable').set('Authorization', `Bearer ${accessToken}`).send({ code: codeAt(secret) })).body.data;

    const wrongPassword = await changePassword(accessToken, { currentPassword: 'Wrong1!Pass', newPassword: NEW_PASSWORD, code: codeAt(secret, 1) });
    expect(wrongPassword.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    const noCode = await changePassword(accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    expect(noCode.status).toBe(400);
    expect(noCode.body.error).toMatchObject({ code: 'INVALID_OTP', message: 'Invalid or expired code' });

    const withApp = await changePassword(accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, code: codeAt(secret, 1) });
    expect(withApp.status).toBe(200);
    const withBackup = await changePassword(withApp.body.data.accessToken, { currentPassword: NEW_PASSWORD, newPassword: 'An0ther!Pass', code: backupCodes[0] });
    expect(withBackup.status).toBe(200);
  }, 30000);

  test('without two-factor, no code is needed', async () => {
    await makeUser('change.plain@gmail.com');
    const { accessToken } = await login('change.plain@gmail.com');
    expect((await changePassword(accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: 'change.plain@gmail.com', password: NEW_PASSWORD })).status).toBe(200);
  }, 30000);
});

describe('password reset', () => {
  test.each(['admin code', 'authenticator code', 'backup code'])('a reset by %s signs every device out and signs no one in', async (kind) => {
    const email = `reset.${kind.split(' ')[0]}.devices@gmail.com`;
    const user = await makeUser(email);
    let code;
    let session;
    if (kind === 'admin code') {
      session = await login(email);
      code = (await request(app).post(`/api/admin/users/${user._id}/reset-code`).set('Authorization', `Bearer ${await adminSession()}`)).body.data.code;
    } else {
      const { accessToken } = await login(email);
      const { secret } = (await request(app).post('/api/auth/mfa/setup').set('Authorization', `Bearer ${accessToken}`).send({ password: PASSWORD })).body.data;
      const { backupCodes } = (await request(app).post('/api/auth/mfa/enable').set('Authorization', `Bearer ${accessToken}`).send({ code: codeAt(secret) })).body.data;
      // A full two-factor sign-in on the "other device".
      const { challengeToken } = await login(email);
      session = (await request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', challengeToken, code: backupCodes[9] })).body.data;
      code = kind === 'authenticator code' ? codeAt(secret, 1) : backupCodes[0];
    }
    expect((await me(session.accessToken)).status).toBe(200);

    const res = await request(app).post('/api/auth/reset-password').send({ email, code, newPassword: NEW_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();
    await expectSignedOut(session);
  }, 30000);
});

describe('tokens from before session versions existed', () => {
  /** A sign-in token in the old format: no version claim, no token ID. */
  const legacyToken = (user) => jwt.sign({ sub: String(user._id), role: user.role, accountStatus: user.accountStatus }, env.jwtSecret, { expiresIn: '1d' });

  test('keep working (they count as version 0) until the version changes', async () => {
    const user = await makeUser('legacy.token@gmail.com');
    const token = legacyToken(user);
    expect(jwt.decode(token).tv).toBeUndefined();
    expect((await me(token)).status).toBe(200);

    // The person changes their password on another device.
    const { accessToken } = await login('legacy.token@gmail.com');
    expect((await changePassword(accessToken, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(200);

    const after = await me(token);
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('SESSION_REVOKED');
  }, 30000);

  test('an account record without the field also counts as version 0', async () => {
    const user = await makeUser('legacy.record@gmail.com');
    await UserRepository.model.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: '' } });
    const raw = await UserRepository.model.collection.findOne({ _id: user._id });
    expect(raw.tokenVersion).toBeUndefined();
    expect((await me(legacyToken(user))).status).toBe(200);
    const session = await login('legacy.record@gmail.com');
    expect((await me(session.accessToken)).status).toBe(200);
    expect((await refresh(session.refreshToken)).status).toBe(200);
  }, 30000);
});

describe('the refresh token checks the version too', () => {
  test('a refresh token whose version is behind is refused even if it is the stored one', async () => {
    const user = await makeUser('refresh.version@gmail.com');
    const session = await login('refresh.version@gmail.com');
    await UserRepository.updateById(user._id, { $inc: { tokenVersion: 1 } }); // refresh-token hash left as it is
    const res = await refresh(session.refreshToken);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_REFRESH_TOKEN');
  }, 30000);
});

describe('suspension, deactivation and archiving end sessions for good', () => {
  test('after suspend and reactivate, the old session does not come back', async () => {
    const user = await makeUser('suspended.later@gmail.com');
    const session = await login('suspended.later@gmail.com');
    const admin = await adminSession();
    await request(app).patch(`/api/admin/users/${user._id}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'suspended', reason: 'Testing' });
    await request(app).patch(`/api/admin/users/${user._id}/status`).set('Authorization', `Bearer ${admin}`).send({ status: 'active' });

    await expectSignedOut(session);
    expect((await me((await login('suspended.later@gmail.com')).accessToken)).status).toBe(200);
  }, 30000);

  test('closing one\'s own account and being archived raise the version', async () => {
    await makeUser('closing.own@gmail.com', { role: 'landlord', emergencyContact: undefined });
    const closing = await login('closing.own@gmail.com');
    await request(app).post('/api/auth/deactivate').set('Authorization', `Bearer ${closing.accessToken}`).send({ reason: 'Moving away' });
    expect((await UserRepository.findByEmail('closing.own@gmail.com')).tokenVersion).toBe(1);

    const archived = await makeUser('archived.later@gmail.com', { lastActivityAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) });
    await require('../../services/AccountLifecycleService').runDailySweep();
    expect((await UserRepository.findById(archived._id)).tokenVersion).toBe(1);
  }, 30000);
});

describe('unique tokens', () => {
  test('two sign-ins in the same second get different tokens', async () => {
    await makeUser('same.second@gmail.com');
    const realNow = Date.now;
    const frozen = realNow();
    jest.spyOn(Date, 'now').mockImplementation(() => frozen);
    const a = await login('same.second@gmail.com');
    const b = await login('same.second@gmail.com');
    Date.now = realNow;
    expect(jwt.decode(a.accessToken).iat).toBe(jwt.decode(b.accessToken).iat);
    expect(a.accessToken).not.toBe(b.accessToken);
    expect(a.refreshToken).not.toBe(b.refreshToken);
    // Only the newest refresh token is stored, so the earlier one is refused.
    expect((await refresh(a.refreshToken)).status).toBe(401);
    expect((await refresh(b.refreshToken)).status).toBe(200);
  }, 30000);
});
