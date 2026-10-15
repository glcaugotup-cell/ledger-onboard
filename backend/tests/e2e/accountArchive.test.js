// Admin Archive: any admin moves an account there (blocked, restorable for 30 days); only the
// main admin deletes early; the daily job erases what is left. Erasing wipes personal details
// and keeps bills, payments and reservations.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const mongoose = require('mongoose');
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
const DAY_MS = 86400000;
let phoneSeq = 0;

async function makeUser(email, role = 'tenant', extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Archive', lastName: 'User', fullName: 'Archive User', email,
    phone: `0917555${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD), role, accountStatus: 'active',
    ...(role === 'tenant' ? { emergencyContact: { name: 'Ana Tenant', phone: '09171234598' } } : {}),
    ...extra,
  });
}

const as = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });
const archive = (actor, user, reason = 'Duplicate account') => request(app).post(`/api/admin/users/${user._id}/archive`).set(as(actor)).send({ reason });
const restore = (actor, user) => request(app).post(`/api/admin/users/${user._id}/restore`).set(as(actor));
const remove = (actor, user) => request(app).delete(`/api/admin/users/${user._id}`).set(as(actor));
const login = (email) => request(app).post('/api/auth/login').send({ email, password: PASSWORD });
const deletedAudit = async (user) => (await AuditLogRepository.findRecent({ action: 'ACCOUNT_DELETED' })).find((l) => String(l.targetId) === String(user._id));

let main;
let other;
beforeAll(async () => {
  main = await makeUser('ledgeronboard@gmail.com', 'admin');
  other = await makeUser('helper.admin@gmail.com', 'admin');
});

test('any admin archives a user: signed out, blocked, hidden from the list, and shown in the Archive for 30 days', async () => {
  const tenant = await makeUser('archive.me@gmail.com');
  const res = await archive(other, tenant);
  expect(res.status).toBe(200);
  expect(res.body.data.user.accountStatus).toBe('pending_deletion');
  const days = (new Date(res.body.data.user.deletion.scheduledFor) - Date.now()) / DAY_MS;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThanOrEqual(30);

  expect((await request(app).get('/api/users/me').set(as(tenant))).status).toBe(401);
  const signIn = await login('archive.me@gmail.com');
  expect(signIn.status).toBe(403);
  expect(signIn.body.error.code).toBe('ACCOUNT_CLOSED');

  const all = await request(app).get('/api/admin/users').set(as(other));
  expect(all.body.data.users.some((u) => u.email === 'archive.me@gmail.com')).toBe(false);
  const archived = await request(app).get('/api/admin/users?accountStatus=pending_deletion').set(as(other));
  expect(archived.body.data.users.map((u) => u.email)).toContain('archive.me@gmail.com');

  // Status buttons cannot bypass the archive, and it cannot be archived twice.
  const reactivate = await request(app).patch(`/api/admin/users/${tenant._id}/status`).set(as(other)).send({ status: 'active' });
  expect(reactivate.body.error.code).toBe('ACCOUNT_IN_ARCHIVE');
  expect((await archive(other, tenant)).status).toBe(409);
});

test('a reason is required to archive', async () => {
  const tenant = await makeUser('no.reason@gmail.com');
  expect((await archive(other, tenant, '')).status).toBe(400);
});

test('restore returns the account to its previous status, and it can sign in again', async () => {
  const suspended = await makeUser('was.suspended@gmail.com', 'tenant', { accountStatus: 'suspended' });
  await archive(other, suspended);
  expect((await restore(other, suspended)).body.data.user.accountStatus).toBe('suspended');

  const tenant = await makeUser('come.back@gmail.com');
  await archive(other, tenant);
  const res = await restore(other, tenant);
  expect(res.status).toBe(200);
  expect(res.body.data.user).toMatchObject({ accountStatus: 'active', deletion: { scheduledFor: null } });
  expect((await login('come.back@gmail.com')).status).toBe(200);
  expect((await restore(other, tenant)).body.error.code).toBe('NOT_ARCHIVED');
});

test('accounts with open reservations cannot be archived', async () => {
  const Reservation = require('../../models/Reservation');
  const tenant = await makeUser('busy.tenant@gmail.com');
  await Reservation.create({ tenantId: tenant._id, propertyId: new mongoose.Types.ObjectId(), roomId: new mongoose.Types.ObjectId(), status: 'active', moveInDate: new Date() });
  const res = await archive(other, tenant);
  expect(res.status).toBe(409);
  expect(res.body.error.code).toBe('ACCOUNT_HAS_OPEN_RESERVATIONS');
});

test('only the main admin deletes, only from the archive; personal data is erased and records are kept', async () => {
  const Notification = require('../../models/Notification');
  const Billing = require('../../models/BillingSOA');
  const tenant = await makeUser('erase.me@gmail.com', 'tenant', { profilePhotoUrl: '/uploads/profile/nothing.jpg' });
  const bill = await Billing.create({
    tenantId: tenant._id, roomId: new mongoose.Types.ObjectId(), billingPeriod: new Date('2026-09-01'),
    baseRent: 1000, totalAmountDue: 1000, remainingBalance: 1000, dueDate: new Date('2026-09-30'),
  });
  await Notification.create({ userId: tenant._id, type: 'BILL_CREATED', title: 'New bill', message: 'Ready' });
  await AuditLogRepository.record({ action: 'TEST_ENTRY', targetType: 'User', targetId: tenant._id, metadata: { email: 'erase.me@gmail.com' } });

  expect((await remove(main, tenant)).body.error.code).toBe('NOT_ARCHIVED');
  await archive(other, tenant);
  const byOther = await remove(other, tenant);
  expect(byOther.status).toBe(403);
  expect(byOther.body.error.code).toBe('MAIN_ADMIN_REQUIRED');

  expect((await remove(main, tenant)).status).toBe(200);
  const erased = await UserRepository.model.findById(tenant._id).lean();
  expect(erased).toMatchObject({ fullName: 'Deleted user', accountStatus: 'deleted', email: `deleted-${tenant._id}@deleted.invalid` });
  expect(erased.phone).toBeUndefined();
  expect(erased.profilePhotoUrl).toBeUndefined();
  expect(erased.emergencyContact).toBeUndefined();
  expect(await Billing.exists({ _id: bill._id, tenantId: tenant._id })).toBeTruthy();
  expect(await Notification.countDocuments({ userId: tenant._id })).toBe(0);
  expect((await deletedAudit(tenant)).metadata).toMatchObject({ role: 'tenant', trigger: 'main_admin' });
  expect(JSON.stringify(await AuditLogRepository.model.find({ targetId: tenant._id }).lean())).not.toContain('erase.me@gmail.com');

  // Gone from every list, the old sign-in fails, the email is free again, and there is no undo.
  const archived = await request(app).get('/api/admin/users?accountStatus=pending_deletion').set(as(main));
  expect(archived.body.data.users.some((u) => String(u._id) === String(tenant._id))).toBe(false);
  expect((await login('erase.me@gmail.com')).status).toBe(401);
  expect(await UserRepository.findByEmail('erase.me@gmail.com')).toBeNull();
  expect((await restore(main, tenant)).status).toBe(404);
});

test('the daily job erases archived accounts once 30 days have passed, not before', async () => {
  const AccountDeletionService = require('../../services/AccountDeletionService');
  const tenant = await makeUser('wait.then.erase@gmail.com');
  await archive(other, tenant);
  expect(await AccountDeletionService.purgeDue(new Date(Date.now() + 29 * DAY_MS))).toBe(0);
  expect((await UserRepository.findById(tenant._id)).accountStatus).toBe('pending_deletion');
  expect(await AccountDeletionService.purgeDue(new Date(Date.now() + 31 * DAY_MS))).toBeGreaterThanOrEqual(1);
  expect((await UserRepository.model.findById(tenant._id).lean()).accountStatus).toBe('deleted');
  expect((await deletedAudit(tenant)).metadata.trigger).toBe('grace_period_ended');
});

test('admin accounts: only the main admin archives them, and no one archives the main admin', async () => {
  const admin = await makeUser('archived.admin@gmail.com', 'admin');
  expect((await archive(other, admin)).body.error.code).toBe('CANNOT_MODIFY_ADMIN');
  expect((await archive(main, admin)).status).toBe(200);
  for (const actor of [main, other]) {
    expect((await archive(actor, main)).body.error.code).toBe('CANNOT_MODIFY_MAIN_ADMIN');
  }
});

describe('the person is told', () => {
  afterEach(() => jest.restoreAllMocks());

  test('when an admin closes the account: an email with the reason and deletion date, even without inbox proof', async () => {
    const send = jest.spyOn(require('../../services/EmailService'), 'send').mockResolvedValue({ accepted: ['x'] });
    const tenant = await makeUser('told.closed@gmail.com', 'tenant', { emailConfirmedAt: null, notificationPreferences: { email: false, inApp: true } });
    await archive(other, tenant, 'Fake or spam account');
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.to).toBe('told.closed@gmail.com');
    expect(mail.subject).toBe('Ledger OnBoard — Your account has been closed');
    expect(mail.text).toContain('Reason: Fake or spam account');
    expect(mail.text).toMatch(/Permanent deletion: [A-Z][a-z]+ \d{1,2}, \d{4}/);
    expect(mail.text).toContain('ledgeronboard@gmail.com');
    expect(mail.unsubscribeUrl).toBeUndefined();
  });

  test('when the account is deleted: one last email to the old address before it is erased', async () => {
    const tenant = await makeUser('told.deleted@gmail.com');
    await archive(other, tenant);
    const send = jest.spyOn(require('../../services/EmailService'), 'send').mockResolvedValue({ accepted: ['x'] });
    expect((await remove(main, tenant)).status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ to: 'told.deleted@gmail.com', subject: 'Ledger OnBoard — Your account has been deleted' });
    expect(send.mock.calls[0][0].html).toContain('href="https://');
  });

  test('a failed notice never blocks the archive or the deletion', async () => {
    jest.spyOn(require('../../services/EmailService'), 'send').mockRejectedValue(new Error('synthetic outage'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const tenant = await makeUser('notice.fails@gmail.com');
    expect((await archive(other, tenant)).status).toBe(200);
    expect((await remove(main, tenant)).status).toBe(200);
    expect((await UserRepository.model.findById(tenant._id).lean()).accountStatus).toBe('deleted');
  });

  test('at sign-in: who closed it, when it will be deleted, and who to contact', async () => {
    const tenant = await makeUser('told.login@gmail.com');
    await archive(other, tenant);
    const res = await login('told.login@gmail.com');
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/^This account was closed by an administrator\. It will be permanently deleted on [A-Z][a-z]+ \d{1,2}, \d{4}\. If you think this is a mistake, contact ledgeronboard@gmail\.com\.$/);
  });
});
