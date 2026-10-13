// The main admin (MAIN_ADMIN_EMAIL, default ledgeronboard@gmail.com) manages the other admins;
// no one, the main admin included, can change the main admin's account through the admin API.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;
let UserRepository;
let AuditLogRepository;
let hashPassword;
let signAccessToken;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  UserRepository = require('../../repositories/UserRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  ({ hashPassword } = require('../../utils/password'));
  ({ signAccessToken } = require('../../utils/jwt'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

const PASSWORD = 'Str0ng!Pass';
const SETUP_CODE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
let phoneSeq = 0;

async function makeUser(email, role = 'admin', extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Admin', lastName: 'User', fullName: 'Admin User', email,
    phone: `0917666${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD), role, accountStatus: 'active',
    ...(role === 'tenant' ? { emergencyContact: { name: 'Ana Tenant', phone: '09171234598' } } : {}),
    ...extra,
  });
}

const as = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });
const newAdmin = (email) => ({ firstName: 'Bea', lastName: 'Santos', email, phone: '09175550101' });

let main;
let other;
beforeAll(async () => {
  main = await makeUser('ledgeronboard@gmail.com');
  other = await makeUser('second.admin@gmail.com');
});

test('only the configured admin account is reported as the main admin', async () => {
  const me = await request(app).get('/api/users/me').set(as(main));
  expect(me.body.data.user.isMainAdmin).toBe(true);
  const list = await request(app).get('/api/admin/users?role=admin').set(as(other));
  const flags = Object.fromEntries(list.body.data.users.map((u) => [u.email, u.isMainAdmin]));
  expect(flags).toMatchObject({ 'ledgeronboard@gmail.com': true, 'second.admin@gmail.com': false });
  // The same email on a non-admin account is not the main admin.
  const { isMainAdmin } = require('../../utils/mainAdmin');
  expect(isMainAdmin({ role: 'tenant', email: 'ledgeronboard@gmail.com' })).toBe(false);
});

test('the main admin adds an admin, who sets their own password with the one-time setup code', async () => {
  const res = await request(app).post('/api/admin/admins').set(as(main)).send(newAdmin('third.admin@gmail.com'));
  expect(res.status).toBe(201);
  expect(res.body.data.code).toMatch(SETUP_CODE);
  expect(res.body.data.user).toMatchObject({ role: 'admin', accountStatus: 'active', isMainAdmin: false, fullName: 'Bea Santos' });
  expect(res.body.data.user.passwordHash).toBeUndefined();

  // No password works until the code is used.
  expect((await request(app).post('/api/auth/login').send({ email: 'third.admin@gmail.com', password: PASSWORD })).status).toBe(401);
  const reset = await request(app).post('/api/auth/reset-password').send({ email: 'third.admin@gmail.com', code: res.body.data.code, newPassword: 'N3w!Password' });
  expect(reset.status).toBe(200);
  expect((await request(app).post('/api/auth/login').send({ email: 'third.admin@gmail.com', password: 'N3w!Password' })).status).toBe(200);

  const audit = (await AuditLogRepository.findRecent({ action: 'ADMIN_CREATED' })).find((l) => String(l.targetId) === String(res.body.data.user._id));
  expect(String(audit.actorId)).toBe(String(main._id));
  expect(JSON.stringify(audit)).not.toContain(res.body.data.code.replace('-', ''));
}, 30000);

test('adding an admin is validated and refused for duplicates, other admins and other roles', async () => {
  expect((await request(app).post('/api/admin/admins').set(as(main)).send(newAdmin('second.admin@gmail.com'))).body.error.code).toBe('ACCOUNT_EXISTS');
  expect((await request(app).post('/api/admin/admins').set(as(main)).send({ email: 'bad' })).status).toBe(400);
  const byOther = await request(app).post('/api/admin/admins').set(as(other)).send(newAdmin('fourth.admin@gmail.com'));
  expect(byOther.status).toBe(403);
  expect(byOther.body.error.code).toBe('MAIN_ADMIN_REQUIRED');
  const tenant = await makeUser('plain.tenant@gmail.com', 'tenant');
  expect((await request(app).post('/api/admin/admins').set(as(tenant)).send(newAdmin('fifth.admin@gmail.com'))).status).toBe(403);
  expect(await UserRepository.findByEmail('fourth.admin@gmail.com')).toBeNull();
});

test('the main admin can suspend, reactivate and issue reset codes for other admins', async () => {
  const target = await makeUser('managed.admin@gmail.com');
  const suspend = await request(app).patch(`/api/admin/users/${target._id}/status`).set(as(main)).send({ status: 'suspended', reason: 'Administrative review' });
  expect(suspend.status).toBe(200);
  expect(suspend.body.data.user.accountStatus).toBe('suspended');
  expect((await request(app).post('/api/auth/login').send({ email: 'managed.admin@gmail.com', password: PASSWORD })).status).toBe(403);
  expect((await request(app).patch(`/api/admin/users/${target._id}/status`).set(as(main)).send({ status: 'active' })).body.data.user.accountStatus).toBe('active');
  const code = await request(app).post(`/api/admin/users/${target._id}/reset-code`).set(as(main));
  expect(code.status).toBe(201);
  expect(code.body.data.code).toMatch(SETUP_CODE);
});

test('other admins still cannot manage admin accounts', async () => {
  const target = await makeUser('peer.admin@gmail.com');
  const res = await request(app).patch(`/api/admin/users/${target._id}/status`).set(as(other)).send({ status: 'suspended', reason: 'Administrative review' });
  expect(res.status).toBe(403);
  expect(res.body.error.code).toBe('CANNOT_MODIFY_ADMIN');
  expect((await request(app).post(`/api/admin/users/${target._id}/reset-code`).set(as(other))).body.error.code).toBe('CANNOT_MODIFY_ADMIN');
});

test('no one can suspend, deactivate or issue a reset code for the main admin, the main admin included', async () => {
  for (const actor of [main, other]) {
    const status = await request(app).patch(`/api/admin/users/${main._id}/status`).set(as(actor)).send({ status: 'deactivated', reason: 'Administrative review' });
    expect(status.status).toBe(403);
    expect(status.body.error.code).toBe('CANNOT_MODIFY_MAIN_ADMIN');
    expect((await request(app).post(`/api/admin/users/${main._id}/reset-code`).set(as(actor))).body.error.code).toBe('CANNOT_MODIFY_MAIN_ADMIN');
    expect((await request(app).post(`/api/admin/users/${main._id}/deactivate-inactive`).set(as(actor)).send({ reason: 'Account appears abandoned' })).body.error.code).toBe('CANNOT_MODIFY_MAIN_ADMIN');
  }
  expect((await UserRepository.findById(main._id)).accountStatus).toBe('active');
});
