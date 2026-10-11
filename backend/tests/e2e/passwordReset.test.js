// Password reset without email: generic forgot-password, reset by admin code, authenticator code
// or backup code, its own failure counter, and the admin reset-code endpoint.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;
let EmailService;
let UserRepository;
let AuditLogRepository;
let hashPassword;
let generateTotp;
let verifyTotp;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  EmailService = require('../../services/EmailService');
  UserRepository = require('../../repositories/UserRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  ({ hashPassword } = require('../../utils/password'));
  ({ generateTotp, verifyTotp } = require('../../utils/totp'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const PASSWORD = 'Str0ng!Pass';
const NEW_PASSWORD = 'N3w!Password';
const GENERIC = 'Invalid or expired code';
const FORGOT_MESSAGE = 'To reset your password, use a code from your authenticator app or one of your backup codes. If you have neither, ask an administrator for a reset code.';
const ADMIN_CODE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;
let phoneSeq = 0;

async function makeUser(email, extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Reset', lastName: 'User', fullName: 'Reset User', email,
    phone: `0917888${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role: 'tenant', accountStatus: 'active',
    emergencyContact: { name: 'Ana Tenant', phone: '09171234598' },
    ...extra,
  });
}

const login = (email, password = PASSWORD) => request(app).post('/api/auth/login').send({ email, password });
const reset = (email, code, newPassword = NEW_PASSWORD) => request(app).post('/api/auth/reset-password').send({ email, code, newPassword });
const authed = (method, path, token) => request(app)[method](path).set('Authorization', `Bearer ${token}`);
const codeAt = (secret, steps = 0) => generateTotp(secret, { nowMs: Date.now() + steps * 30000 });
function wrongCode(secret) {
  for (let n = 0; ; n += 1) {
    const candidate = String(n).padStart(6, '0');
    if (verifyTotp(secret, candidate) === null) return candidate;
  }
}

let adminToken;
async function adminSession() {
  if (adminToken) return adminToken;
  await makeUser('reset.admin@gmail.com', { role: 'admin', emergencyContact: undefined });
  adminToken = (await login('reset.admin@gmail.com')).body.data.accessToken;
  return adminToken;
}

async function issueCode(userId) {
  return authed('post', `/api/admin/users/${userId}/reset-code`, await adminSession());
}

/** A user with authenticator two-factor on; the enable code's step is spent. */
async function enrolledUser(email) {
  await makeUser(email);
  const token = (await login(email)).body.data.accessToken;
  const { secret } = (await authed('post', '/api/auth/mfa/setup', token).send({ password: PASSWORD })).body.data;
  const { backupCodes } = (await authed('post', '/api/auth/mfa/enable', token).send({ code: codeAt(secret) })).body.data;
  return { token, secret, backupCodes };
}

/** Signs in with two-factor using the next app step (the current one may already be spent). */
async function signInWithCode(email, password, secret) {
  const { challengeToken } = (await login(email, password)).body.data;
  return request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', challengeToken, code: codeAt(secret, 1) });
}

describe('4.1 forgot-password sends nothing', () => {
  test('real, archived and unknown emails get the identical instructions, and nothing is sent or stored', async () => {
    const real = await makeUser('forgot.real@gmail.com');
    await makeUser('forgot.archived@gmail.com', { accountStatus: 'archived' });
    const sendSpy = jest.spyOn(EmailService, 'send');

    const responses = await Promise.all(
      ['forgot.real@gmail.com', 'forgot.archived@gmail.com', 'nobody.forgot@gmail.com'].map((email) => request(app).post('/api/auth/forgot-password').send({ email }))
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual(responses[0].body);
    }
    expect(responses[0].body.data.message).toBe(FORGOT_MESSAGE);
    expect(sendSpy).not.toHaveBeenCalled();
    const stored = await UserRepository.findByIdWithSecrets(real._id);
    expect(stored.otp.codeHash).toBeNull();
  }, 30000);
});

describe('4.3 admin reset codes', () => {
  test('only admins can issue one; tenants, landlords, caretakers and anonymous callers cannot', async () => {
    const target = await makeUser('code.target@gmail.com');
    for (const role of ['tenant', 'landlord', 'caretaker']) {
      await makeUser(`not.admin.${role}@gmail.com`, { role, emergencyContact: undefined });
      const token = (await login(`not.admin.${role}@gmail.com`)).body.data.accessToken;
      const res = await authed('post', `/api/admin/users/${target._id}/reset-code`, token);
      expect(res.status).toBe(403);
    }
    expect((await request(app).post(`/api/admin/users/${target._id}/reset-code`)).status).toBe(401);
    expect((await UserRepository.findByIdWithSecrets(target._id)).otp.codeHash).toBeNull();
  }, 30000);

  test('an admin gets an 8-character code without look-alikes, stored only as a hash, valid 30 minutes, audited without the code', async () => {
    const target = await makeUser('code.issued@gmail.com');
    const before = Date.now();

    const res = await issueCode(target._id);

    expect(res.status).toBe(201);
    const { code, expiresAt } = res.body.data;
    expect(code).toMatch(ADMIN_CODE);
    const ttl = new Date(expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(29 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);

    const stored = await UserRepository.findByIdWithSecrets(target._id);
    expect(stored.otp.purpose).toBe('password_reset');
    expect(stored.otp.codeHash).toMatch(/^\$2[aby]\$/);
    expect(stored.otp.codeHash).not.toContain(code.replace('-', ''));

    const audit = (await AuditLogRepository.findRecent({ action: 'PASSWORD_RESET_CODE_ISSUED' })).find((l) => String(l.targetId) === String(target._id));
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain(code);
    expect(JSON.stringify(audit)).not.toContain(code.replace('-', ''));
  }, 30000);

  test('admin accounts, unknown ids and caretakers who have not activated are refused', async () => {
    const otherAdmin = await makeUser('other.admin@gmail.com', { role: 'admin', emergencyContact: undefined });
    expect((await issueCode(otherAdmin._id)).body.error.code).toBe('CANNOT_MODIFY_ADMIN');
    expect((await issueCode('64b000000000000000000099')).status).toBe(404);
    const pending = await makeUser('pending.caretaker@gmail.com', { role: 'caretaker', accountStatus: 'pending_activation', emergencyContact: undefined });
    const res = await issueCode(pending._id);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_ACTIVATED');
  }, 30000);

  test('the code works once, in any case and with or without the dash, then signs in with the new password', async () => {
    const target = await makeUser('code.once@gmail.com');
    const { code } = (await issueCode(target._id)).body.data;
    const oldSession = (await login('code.once@gmail.com')).body.data;

    const res = await reset('code.once@gmail.com', code.toLowerCase().replace('-', ''));
    expect(res.status).toBe(200);

    // The saved sign-in from before the reset can no longer be renewed. (Checked before signing in
    // again: two sign-ins in the same second produce identical refresh tokens.)
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: oldSession.refreshToken })).status).toBe(401);
    expect((await login('code.once@gmail.com')).status).toBe(401);
    expect((await login('code.once@gmail.com', NEW_PASSWORD)).status).toBe(200);

    const again = await reset('code.once@gmail.com', code, 'An0ther!Pass');
    expect(again.status).toBe(400);
    expect(again.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });

    const audit = (await AuditLogRepository.findRecent({ action: 'PASSWORD_RESET' })).find((l) => String(l.targetId) === String(target._id));
    expect(audit.metadata).toEqual({ method: 'admin_code' });
  }, 30000);

  test('the code expires after 30 minutes', async () => {
    const target = await makeUser('code.expired@gmail.com');
    const { code } = (await issueCode(target._id)).body.data;
    const later = Date.now() + 31 * 60 * 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => later);

    const res = await reset('code.expired@gmail.com', code);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });
  }, 30000);

  test('a new code replaces the previous one', async () => {
    const target = await makeUser('code.replaced@gmail.com');
    const first = (await issueCode(target._id)).body.data.code;
    const second = (await issueCode(target._id)).body.data.code;
    expect((await reset('code.replaced@gmail.com', first)).status).toBe(400);
    expect((await reset('code.replaced@gmail.com', second)).status).toBe(200);
  }, 30000);
});

describe('4.2 reset with an authenticator or backup code', () => {
  test('an authenticator code resets the password, once', async () => {
    const { secret } = await enrolledUser('totp.reset@gmail.com');
    const code = codeAt(secret, 1);

    expect((await reset('totp.reset@gmail.com', code)).status).toBe(200);
    const replay = await reset('totp.reset@gmail.com', code, 'An0ther!Pass');
    expect(replay.status).toBe(400);
    expect(replay.body.error.message).toBe(GENERIC);

    const user = await UserRepository.findByEmail('totp.reset@gmail.com');
    const audit = (await AuditLogRepository.findRecent({ action: 'PASSWORD_RESET' })).find((l) => String(l.targetId) === String(user._id));
    expect(audit.metadata).toEqual({ method: 'totp' });
  }, 30000);

  test('a backup code resets the password, once', async () => {
    const { backupCodes } = await enrolledUser('backup.reset@gmail.com');

    expect((await reset('backup.reset@gmail.com', backupCodes[0])).status).toBe(200);
    expect((await reset('backup.reset@gmail.com', backupCodes[0], 'An0ther!Pass')).status).toBe(400);
    expect((await login('backup.reset@gmail.com', NEW_PASSWORD)).body.data.mfaRequired).toBe(true);
  }, 30000);

  test('without two-factor, authenticator-style and backup-style codes are just wrong codes', async () => {
    await makeUser('no.mfa.reset@gmail.com');
    for (const code of ['123456', 'ABCDE-FGHJK']) {
      const res = await reset('no.mfa.reset@gmail.com', code);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });
    }
  }, 30000);

  test('wrong codes and unknown emails get the same generic error; malformed codes are refused as input', async () => {
    const { secret } = await enrolledUser('wrong.reset@gmail.com');
    const wrongApp = await reset('wrong.reset@gmail.com', wrongCode(secret));
    const wrongAdmin = await reset('wrong.reset@gmail.com', 'ABCD-EFGH');
    const unknown = await reset('nobody.reset@gmail.com', '123456');
    for (const res of [wrongApp, wrongAdmin, unknown]) {
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });
    }
    const malformed = await reset('wrong.reset@gmail.com', '1234567');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  }, 30000);
});

describe('4.2 the reset counter is separate from sign-in codes', () => {
  test('five wrong resets lock resets (429, even for a valid code) but never sign-in codes', async () => {
    const { secret } = await enrolledUser('reset.lock@gmail.com');
    const user = await UserRepository.findByEmail('reset.lock@gmail.com');
    const { code: adminCode } = (await issueCode(user._id)).body.data;

    for (let i = 0; i < 5; i += 1) {
      const res = await reset('reset.lock@gmail.com', 'ZZZZ-ZZZZ');
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe(GENERIC);
    }
    const locked = await reset('reset.lock@gmail.com', adminCode);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');

    const stored = await UserRepository.findByEmail('reset.lock@gmail.com', { withSecrets: true });
    expect(stored.mfaTotp.failedAttempts).toBe(0);
    expect(stored.mfaTotp.lockedUntil).toBeNull();
    // Sign-in with two-factor still works with the old password.
    expect((await signInWithCode('reset.lock@gmail.com', PASSWORD, secret)).status).toBe(200);
    const lockLog = await AuditLogRepository.findRecent({ action: 'PASSWORD_RESET_LOCKED' });
    expect(lockLog.some((l) => String(l.targetId) === String(user._id))).toBe(true);
  }, 30000);

  test('locked sign-in codes never block a reset, and a reset leaves the sign-in counter alone', async () => {
    const { secret } = await enrolledUser('signin.lock@gmail.com');
    const { challengeToken } = (await login('signin.lock@gmail.com')).body.data;
    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', challengeToken, code: wrongCode(secret) });
    }
    const signInLocked = await request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', challengeToken, code: codeAt(secret, 1) });
    expect(signInLocked.status).toBe(429);
    const lockedUntil = (await UserRepository.findByEmail('signin.lock@gmail.com', { withSecrets: true })).mfaTotp.lockedUntil;

    const res = await reset('signin.lock@gmail.com', codeAt(secret, 1));
    expect(res.status).toBe(200);

    const stored = await UserRepository.findByEmail('signin.lock@gmail.com', { withSecrets: true });
    expect(stored.passwordReset.failedAttempts).toBe(0);
    expect(stored.mfaTotp.lockedUntil.getTime()).toBe(lockedUntil.getTime()); // untouched by the reset
  }, 30000);

  test('wrong reset codes do not count towards the sign-in limit, and wrong sign-in codes not towards resets', async () => {
    const { secret } = await enrolledUser('both.counters@gmail.com');
    for (let i = 0; i < 4; i += 1) await reset('both.counters@gmail.com', wrongCode(secret));
    const { challengeToken } = (await login('both.counters@gmail.com')).body.data;
    for (let i = 0; i < 4; i += 1) {
      await request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', challengeToken, code: wrongCode(secret) });
    }
    const stored = await UserRepository.findByEmail('both.counters@gmail.com', { withSecrets: true });
    expect(stored.passwordReset.failedAttempts).toBe(4);
    expect(stored.mfaTotp.failedAttempts).toBe(4);
    // Neither has reached its own limit, so both still work.
    expect((await request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', challengeToken, code: codeAt(secret, 1) })).status).toBe(200);
  }, 30000);
});

describe('no code reaches the logs or the audit trail', () => {
  test('admin codes, app codes and backup codes stay out of logs and audit entries', async () => {
    const logged = [];
    for (const level of ['log', 'info', 'warn', 'error']) {
      jest.spyOn(console, level).mockImplementation((...args) => logged.push(args.map(String).join(' ')));
    }
    const { secret, backupCodes } = await enrolledUser('reset.leaks@gmail.com');
    const user = await UserRepository.findByEmail('reset.leaks@gmail.com');
    const { code: adminCode } = (await issueCode(user._id)).body.data;
    await reset('reset.leaks@gmail.com', backupCodes[0]);
    await reset('reset.leaks@gmail.com', adminCode, 'An0ther!Pass');

    const audit = (await AuditLogRepository.findRecent({ limit: 500 })).filter((l) => String(l.targetId) === String(user._id));
    expect(audit.map((l) => l.action)).toEqual(expect.arrayContaining(['PASSWORD_RESET_CODE_ISSUED', 'PASSWORD_RESET']));
    const everything = [...logged, ...audit.map((l) => JSON.stringify(l))].join('\n');
    for (const code of [adminCode, backupCodes[0], secret, NEW_PASSWORD, 'An0ther!Pass']) {
      expect(everything).not.toContain(code);
      expect(everything).not.toContain(code.replace('-', ''));
    }
  }, 30000);
});
