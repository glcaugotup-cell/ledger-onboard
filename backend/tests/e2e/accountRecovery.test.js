// Archived-account recovery needs the same proof as a password reset (an admin reset code, an
// authenticator code or a backup code) and has its own failure counter. A password reset on an
// archived account restores it the same way. The inactivity sweep never archives admins.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;
let UserRepository;
let AuditLogRepository;
let AccountLifecycleService;
let hashPassword;
let generateTotp;
let verifyTotp;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  UserRepository = require('../../repositories/UserRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  AccountLifecycleService = require('../../services/AccountLifecycleService');
  ({ hashPassword } = require('../../utils/password'));
  ({ generateTotp, verifyTotp } = require('../../utils/totp'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'Str0ng!Pass';
const NEW_PASSWORD = 'N3w!Password';
const GENERIC = 'Invalid or expired code';
const ARCHIVED = { accountStatus: 'archived', archivedAt: new Date(), archiveReason: 'INACTIVITY' };
let phoneSeq = 0;

async function makeUser(email, extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Recover', lastName: 'User', fullName: 'Recover User', email,
    phone: `0917777${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role: 'tenant', accountStatus: 'active',
    emergencyContact: { name: 'Ana Tenant', phone: '09171234598' },
    ...extra,
  });
}

const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });
const recover = (email, code, newPassword = NEW_PASSWORD) => request(app).post('/api/auth/account-recovery').send({ email, code, newPassword });
const reset = (email, code, newPassword = NEW_PASSWORD) => request(app).post('/api/auth/reset-password').send({ email, code, newPassword });
const authed = (method, path, token) => request(app)[method](path).set('Authorization', `Bearer ${token}`);
const codeAt = (secret, steps = 0) => generateTotp(secret, { nowMs: Date.now() + steps * 30000 });
function wrongCode(secret) {
  for (let n = 0; ; n += 1) {
    const candidate = String(n).padStart(6, '0');
    if (verifyTotp(secret, candidate) === null) return candidate;
  }
}
const archive = (userId) => UserRepository.updateById(userId, ARCHIVED);
const auditFor = async (action, userId) => (await AuditLogRepository.findRecent({ action })).filter((l) => String(l.targetId) === String(userId));

let adminToken;
async function adminSession() {
  if (adminToken) return adminToken;
  await makeUser('recovery.admin@gmail.com', { role: 'admin', emergencyContact: undefined });
  adminToken = (await login('recovery.admin@gmail.com')).body.data.accessToken;
  return adminToken;
}

async function issueCode(userId) {
  const res = await authed('post', `/api/admin/users/${userId}/reset-code`, await adminSession());
  expect(res.status).toBe(201);
  return res.body.data.code;
}

/** A user with authenticator two-factor on (the enable code's step is spent), still active. */
async function enrolledUser(email) {
  const user = await makeUser(email);
  const token = (await login(email)).body.data.accessToken;
  const { secret } = (await authed('post', '/api/auth/mfa/setup', token).send({ password: PASSWORD })).body.data;
  const { backupCodes } = (await authed('post', '/api/auth/mfa/enable', token).send({ code: codeAt(secret) })).body.data;
  return { user, secret, backupCodes };
}

function expectGeneric(res) {
  expect(res.status).toBe(400);
  expect(res.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });
}

describe('account recovery needs a code', () => {
  test('an email and a new password alone are refused, and the account stays archived with its old password', async () => {
    await makeUser('no.code@gmail.com', ARCHIVED);

    const res = await request(app).post('/api/auth/account-recovery').send({ email: 'no.code@gmail.com', newPassword: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d) => d.field)).toContain('code');
    expect((await UserRepository.findByEmail('no.code@gmail.com')).accountStatus).toBe('archived');
    expect((await login('no.code@gmail.com')).body.error.code).toBe('ACCOUNT_ARCHIVED'); // old password still the one
  }, 30000);

  test('an admin code restores the account, ends old sessions, is spent by its use and is audited with the method', async () => {
    const user = await makeUser('admin.code.recover@gmail.com', { ...ARCHIVED, refreshTokenHash: 'stale', archiveWarningSentAt: new Date(), scheduledArchiveAt: new Date(), lastActivityAt: new Date(Date.now() - 40 * DAY_MS) });
    const code = await issueCode(user._id);
    const before = Date.now();

    const res = await recover('admin.code.recover@gmail.com', code.toLowerCase().replace('-', ''));

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Account recovered. You can now log in with your new password.');
    const stored = await UserRepository.findByIdWithSecrets(user._id);
    expect(stored).toMatchObject({ accountStatus: 'active', archivedAt: null, archiveReason: null, archiveWarningSentAt: null, scheduledArchiveAt: null, refreshTokenHash: null, tokenVersion: 1 });
    expect(stored.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.otp.codeHash).toBeNull();
    expect((await login('admin.code.recover@gmail.com')).status).toBe(401);
    expect((await login('admin.code.recover@gmail.com', NEW_PASSWORD)).status).toBe(200);
    expectGeneric(await reset('admin.code.recover@gmail.com', code, 'An0ther!Pass')); // spent

    const audit = await auditFor('ACCOUNT_RECOVERED', user._id);
    expect(audit).toHaveLength(1);
    expect(audit[0].metadata).toEqual({ method: 'admin_code' });
  }, 30000);

  test('an authenticator code restores the account, and two-factor stays on', async () => {
    const { user, secret } = await enrolledUser('totp.recover@gmail.com');
    await archive(user._id);

    expect((await recover('totp.recover@gmail.com', codeAt(secret, 1))).status).toBe(200);

    expect((await UserRepository.findById(user._id)).accountStatus).toBe('active');
    expect((await login('totp.recover@gmail.com', NEW_PASSWORD)).body.data.mfaRequired).toBe(true);
    expect((await auditFor('ACCOUNT_RECOVERED', user._id))[0].metadata).toEqual({ method: 'totp' });
  }, 30000);

  test('a backup code restores the account and is used up', async () => {
    const { user, backupCodes } = await enrolledUser('backup.recover@gmail.com');
    await archive(user._id);

    expect((await recover('backup.recover@gmail.com', backupCodes[0])).status).toBe(200);

    expect((await UserRepository.findByIdWithSecrets(user._id)).mfaTotp.backupCodeHashes).toHaveLength(backupCodes.length - 1);
    expectGeneric(await reset('backup.recover@gmail.com', backupCodes[0]));
    expect((await auditFor('ACCOUNT_RECOVERED', user._id))[0].metadata).toEqual({ method: 'backup' });
  }, 30000);

  test('an expired admin code fails', async () => {
    const user = await makeUser('expired.recover@gmail.com', ARCHIVED);
    const code = await issueCode(user._id);
    const later = Date.now() + 31 * 60 * 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => later);

    expectGeneric(await recover('expired.recover@gmail.com', code));
    jest.restoreAllMocks();
    expect((await UserRepository.findById(user._id)).accountStatus).toBe('archived');
  }, 30000);

  test('wrong codes, unknown emails and accounts that are not archived all get the same generic error', async () => {
    const { user, secret } = await enrolledUser('wrong.recover@gmail.com');
    await archive(user._id);
    const active = await makeUser('active.recover@gmail.com');
    const activeCode = await issueCode(active._id);
    const responses = [
      await recover('wrong.recover@gmail.com', wrongCode(secret)),
      await recover('wrong.recover@gmail.com', 'ABCD-EFGH'),
      await recover('nobody.recover@gmail.com', '123456'),
      await recover('active.recover@gmail.com', activeCode), // a valid code, but nothing to recover
    ];
    for (const status of ['suspended', 'deactivated']) {
      const other = await makeUser(`${status}.recover@gmail.com`, { accountStatus: status });
      responses.push(await recover(`${status}.recover@gmail.com`, await issueCode(other._id)));
      expect((await UserRepository.findById(other._id)).accountStatus).toBe(status);
    }

    for (const res of responses) {
      expectGeneric(res);
      expect(res.body).toEqual(responses[0].body);
    }
    expect((await login('active.recover@gmail.com')).status).toBe(200); // password unchanged
  }, 30000);

  test('an account that is not archived never has its code checked, so no code is used up', async () => {
    const { secret, backupCodes } = await enrolledUser('unspent.recover@gmail.com');
    const appCode = codeAt(secret, 1);

    expectGeneric(await recover('unspent.recover@gmail.com', appCode));
    expectGeneric(await recover('unspent.recover@gmail.com', backupCodes[0]));

    // Both codes still work where they apply.
    expect((await reset('unspent.recover@gmail.com', appCode)).status).toBe(200);
    expect((await reset('unspent.recover@gmail.com', backupCodes[0], 'An0ther!Pass')).status).toBe(200);
  }, 30000);
});

describe('account recovery has its own failure counter', () => {
  test('five failures lock recovery (429, even for a valid code), but not resets or sign-in codes', async () => {
    const { user, secret } = await enrolledUser('recover.lock@gmail.com');
    await archive(user._id);
    const adminCode = await issueCode(user._id);

    for (let i = 0; i < 5; i += 1) expectGeneric(await recover('recover.lock@gmail.com', 'ZZZZ-ZZZZ'));
    const locked = await recover('recover.lock@gmail.com', adminCode);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    expect(await auditFor('ACCOUNT_RECOVERY_LOCKED', user._id)).toHaveLength(1);

    const stored = await UserRepository.findByIdWithSecrets(user._id);
    expect(stored.accountStatus).toBe('archived');
    expect(stored.passwordReset.failedAttempts).toBe(0);
    expect(stored.passwordReset.lockedUntil).toBeNull();
    expect(stored.mfaTotp.failedAttempts).toBe(0);
    expect(stored.mfaTotp.lockedUntil).toBeNull();
    // A reset still works (and restores the account).
    expect((await reset('recover.lock@gmail.com', codeAt(secret, 1))).status).toBe(200);
    expect((await UserRepository.findById(user._id)).accountStatus).toBe('active');
  }, 30000);

  test('a locked reset never blocks recovery', async () => {
    const user = await makeUser('reset.lock.recover@gmail.com', ARCHIVED);
    const adminCode = await issueCode(user._id);

    for (let i = 0; i < 5; i += 1) expectGeneric(await reset('reset.lock.recover@gmail.com', 'ZZZZ-ZZZZ'));
    expect((await reset('reset.lock.recover@gmail.com', adminCode)).status).toBe(429);

    expect((await recover('reset.lock.recover@gmail.com', adminCode)).status).toBe(200);
    const stored = await UserRepository.findByIdWithSecrets(user._id);
    expect(stored.accountStatus).toBe('active');
    expect(stored.accountRecovery.failedAttempts).toBe(0);
  }, 30000);

  test('failures count for accounts that are not archived too, so a lock reveals nothing about archiving', async () => {
    await makeUser('active.lock.recover@gmail.com');

    for (let i = 0; i < 5; i += 1) expectGeneric(await recover('active.lock.recover@gmail.com', 'ZZZZ-ZZZZ'));

    expect((await recover('active.lock.recover@gmail.com', 'ZZZZ-ZZZZ')).status).toBe(429);
    expect((await login('active.lock.recover@gmail.com')).status).toBe(200); // sign-in unaffected
  }, 30000);
});

describe('a password reset restores an archived account', () => {
  test('it restores the account exactly like recovery and writes ACCOUNT_RECOVERED', async () => {
    const user = await makeUser('reset.archived@gmail.com', { ...ARCHIVED, refreshTokenHash: 'stale', archiveWarningSentAt: new Date(), scheduledArchiveAt: new Date(), lastActivityAt: new Date(Date.now() - 40 * DAY_MS) });
    const code = await issueCode(user._id);
    const before = Date.now();

    expect((await reset('reset.archived@gmail.com', code)).status).toBe(200);

    const stored = await UserRepository.findByIdWithSecrets(user._id);
    expect(stored).toMatchObject({ accountStatus: 'active', archivedAt: null, archiveReason: null, archiveWarningSentAt: null, scheduledArchiveAt: null, refreshTokenHash: null, tokenVersion: 1 });
    expect(stored.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before);
    expect((await login('reset.archived@gmail.com', NEW_PASSWORD)).status).toBe(200);
    const recovered = await auditFor('ACCOUNT_RECOVERED', user._id);
    expect(recovered).toHaveLength(1);
    expect(recovered[0].metadata).toEqual({ method: 'admin_code' });
    expect((await auditFor('PASSWORD_RESET', user._id))[0].metadata).toEqual({ method: 'admin_code' });
  }, 30000);

  test('suspended and deactivated accounts get the new password but keep their status, with no ACCOUNT_RECOVERED', async () => {
    for (const [status, code] of [['suspended', 'ACCOUNT_SUSPENDED'], ['deactivated', 'ACCOUNT_DEACTIVATED']]) {
      const user = await makeUser(`reset.${status}@gmail.com`, { accountStatus: status });

      expect((await reset(`reset.${status}@gmail.com`, await issueCode(user._id))).status).toBe(200);

      expect((await UserRepository.findById(user._id)).accountStatus).toBe(status);
      // Sign-in checks the password before the status: this answer means the new password is the one.
      expect((await login(`reset.${status}@gmail.com`, NEW_PASSWORD)).body.error.code).toBe(code);
      expect(await auditFor('ACCOUNT_RECOVERED', user._id)).toHaveLength(0);
    }
  }, 30000);
});

describe('the inactivity sweep skips admins', () => {
  test('an inactive admin is neither warned nor archived; an inactive tenant still is', async () => {
    const longIdle = new Date(Date.now() - 40 * DAY_MS);
    const admin = await makeUser('idle.admin@gmail.com', { role: 'admin', emergencyContact: undefined, lastActivityAt: longIdle });
    const warnAdmin = await makeUser('warn.admin@gmail.com', { role: 'admin', emergencyContact: undefined, lastActivityAt: new Date(Date.now() - 26 * DAY_MS) });
    const tenant = await makeUser('idle.sweep.tenant@gmail.com', { lastActivityAt: longIdle });

    await AccountLifecycleService.runDailySweep();

    for (const id of [admin._id, warnAdmin._id]) {
      const stored = await UserRepository.findById(id);
      expect(stored.accountStatus).toBe('active');
      expect(stored.archiveWarningSentAt).toBeNull();
      expect(await auditFor('ACCOUNT_ARCHIVED', id)).toHaveLength(0);
      expect(await auditFor('ACCOUNT_ARCHIVE_WARNING_SENT', id)).toHaveLength(0);
    }
    expect((await UserRepository.findById(tenant._id)).accountStatus).toBe('archived');
    expect((await login('idle.admin@gmail.com')).status).toBe(200);
  }, 30000);
});
