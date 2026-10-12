// Phase 5: caretakers activate with a one-time code from their landlord instead of a shared
// password. Runs with the email transport set to none: nothing here needs email.
process.env.EMAIL_TRANSPORT = 'none';
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
let comparePassword;
let hashOtp;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  EmailService = require('../../services/EmailService');
  UserRepository = require('../../repositories/UserRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  ({ hashPassword, comparePassword } = require('../../utils/password'));
  ({ hashOtp } = require('../../utils/otp'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const HOUR_MS = 60 * 60 * 1000;
const PASSWORD = 'Str0ng!Pass';
const NEW_PASSWORD = 'N3w!Password';
// The shared temporary password every caretaker invited before phase 5 was given.
const LEGACY_SHARED_PASSWORD = 'caretaker1234';
const CODE = /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/;
const GENERIC = { code: 'INVALID_ACTIVATION_CODE', message: 'Invalid or expired activation code' };
let phoneSeq = 0;

async function makeUser(email, extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Code', lastName: 'User', fullName: 'Code User', email,
    phone: `0917666${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role: 'caretaker', accountStatus: 'active',
    ...extra,
  });
}

let landlordToken;
async function landlordSession() {
  if (landlordToken) return landlordToken;
  await makeUser('code.landlord@gmail.com', { role: 'landlord', businessVerificationStatus: 'VERIFIED' });
  landlordToken = (await request(app).post('/api/auth/login').send({ email: 'code.landlord@gmail.com', password: PASSWORD })).body.data.accessToken;
  return landlordToken;
}

async function landlordId() {
  await landlordSession();
  return (await UserRepository.findByEmail('code.landlord@gmail.com'))._id;
}

async function invite(email) {
  const res = await request(app)
    .post('/api/landlord/caretakers')
    .set('Authorization', `Bearer ${await landlordSession()}`)
    .send({ firstName: 'Code', lastName: 'Caretaker', email, phone: `0930666${String((phoneSeq += 1)).padStart(4, '0')}`, serviceBarangay: 'Poblacion Oeste' });
  expect(res.status).toBe(201);
  return res.body.data;
}

const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });
const activate = (email, code, password = NEW_PASSWORD) => request(app).post('/api/auth/activate-caretaker').send({ email, code, password });

function expectGeneric(res) {
  expect(res.status).toBe(400);
  expect(res.body.error).toMatchObject(GENERIC);
}

describe('5.1 no shared password', () => {
  test('a new caretaker gets a hash that no password matches, the old shared one included', async () => {
    const { caretaker } = await invite('no.shared@gmail.com');

    const stored = await UserRepository.findByIdWithSecrets(caretaker._id);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(await comparePassword(LEGACY_SHARED_PASSWORD, stored.passwordHash)).toBe(false);
    const other = await invite('no.shared.other@gmail.com');
    expect((await UserRepository.findByIdWithSecrets(other.caretaker._id)).passwordHash).not.toBe(stored.passwordHash);
  }, 30000);

  test('a caretaker invited before phase 5, with the old shared password still saved, gets exactly the wrong-password answer', async () => {
    await makeUser('legacy.pending@gmail.com', { accountStatus: 'pending_activation', passwordHash: await hashPassword(LEGACY_SHARED_PASSWORD) });

    const withShared = await login('legacy.pending@gmail.com', LEGACY_SHARED_PASSWORD);
    const withWrong = await login('legacy.pending@gmail.com', 'Wr0ng!Pass');

    expect(withShared.status).toBe(401);
    expect(withShared.body).toEqual(withWrong.body);
    expect(withShared.body.error).toMatchObject({ code: 'INCORRECT_PASSWORD', message: 'Incorrect password.' });
  }, 30000);

  test('a caretaker created the old way (shared password saved, no code) gets a code through resend and activates; the shared password fails until then and after', async () => {
    const legacy = await makeUser('legacy.resend@gmail.com', {
      accountStatus: 'pending_activation', passwordHash: await hashPassword(LEGACY_SHARED_PASSWORD), assignedLandlordId: await landlordId(),
    });
    expect((await UserRepository.findByIdWithSecrets(legacy._id)).otp.codeHash).toBeNull();
    expect((await login('legacy.resend@gmail.com', LEGACY_SHARED_PASSWORD)).body.error.code).toBe('INCORRECT_PASSWORD');

    const resent = await request(app).post(`/api/landlord/caretakers/${legacy._id}/resend-invitation`).set('Authorization', `Bearer ${await landlordSession()}`);
    expect(resent.status).toBe(200);
    expect(resent.body.data.activationCode).toMatch(CODE);
    expect((await login('legacy.resend@gmail.com', LEGACY_SHARED_PASSWORD)).body.error.code).toBe('INCORRECT_PASSWORD');

    expect((await activate('legacy.resend@gmail.com', resent.body.data.activationCode)).status).toBe(200);
    expect((await login('legacy.resend@gmail.com', NEW_PASSWORD)).status).toBe(200);
    expect((await login('legacy.resend@gmail.com', LEGACY_SHARED_PASSWORD)).body.error.code).toBe('INCORRECT_PASSWORD');
  }, 30000);

  test('an admin cannot make a caretaker who has not activated active; other status changes still work', async () => {
    const pending = await makeUser('admin.pending@gmail.com', { accountStatus: 'pending_activation', passwordHash: await hashPassword(LEGACY_SHARED_PASSWORD) });
    await makeUser('code.admin@gmail.com', { role: 'admin' });
    const adminToken = (await login('code.admin@gmail.com', PASSWORD)).body.data.accessToken;
    const setStatus = (status, reason) => request(app).patch(`/api/admin/users/${pending._id}/status`).set('Authorization', `Bearer ${adminToken}`).send({ status, reason });

    const res = await setStatus('active');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ACCOUNT_NOT_ACTIVATED');
    expect(res.body.error.message).toMatch(/landlord must give them an activation code/);
    expect((await UserRepository.findById(pending._id)).accountStatus).toBe('pending_activation');
    expect((await login('admin.pending@gmail.com', LEGACY_SHARED_PASSWORD)).status).toBe(401);
    expect((await setStatus('deactivated', 'Invited by mistake')).status).toBe(200);
  }, 30000);

  test('those attempts count towards the per-email sign-in lockout, like wrong passwords', async () => {
    await makeUser('legacy.lockout@gmail.com', { accountStatus: 'pending_activation', passwordHash: await hashPassword(LEGACY_SHARED_PASSWORD) });

    for (let i = 0; i < 10; i += 1) expect((await login('legacy.lockout@gmail.com', LEGACY_SHARED_PASSWORD)).status).toBe(401);

    expect((await login('legacy.lockout@gmail.com', LEGACY_SHARED_PASSWORD)).body.error.code).toBe('LOGIN_LOCKED');
  }, 30000);
});

describe('5.2 the invite returns an activation code', () => {
  test('the code is returned once, stored only as a hash with purpose caretaker_activation for 72 hours, and audited without the code', async () => {
    const before = Date.now();
    const sendSpy = jest.spyOn(EmailService, 'send');

    const { caretaker, activationCode, expiresAt } = await invite('code.stored@gmail.com');

    expect(activationCode).toMatch(CODE);
    expect(sendSpy).not.toHaveBeenCalled();
    const expiresMs = new Date(expiresAt).getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + 72 * HOUR_MS);
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + 72 * HOUR_MS);
    const stored = await UserRepository.findByIdWithSecrets(caretaker._id);
    expect(stored.otp.purpose).toBe('caretaker_activation');
    expect(stored.otp.expiresAt.getTime()).toBe(expiresMs);
    expect(stored.otp.codeHash).not.toContain(activationCode.replace('-', ''));
    const audit = (await AuditLogRepository.findRecent({ action: 'CARETAKER_CREATED' })).find((l) => String(l.targetId) === String(caretaker._id));
    expect(audit).toBeTruthy();
    expect(JSON.stringify(audit)).not.toContain(activationCode.replace('-', ''));
    // The list of caretakers never shows a code.
    const list = await request(app).get('/api/landlord/caretakers').set('Authorization', `Bearer ${await landlordSession()}`);
    expect(JSON.stringify(list.body)).not.toContain(activationCode);
  }, 30000);

  test('no code reaches the console on invite, resend or activation', async () => {
    const logSpy = jest.spyOn(console, 'log');
    const errorSpy = jest.spyOn(console, 'error');

    const { caretaker, activationCode } = await invite('code.quiet@gmail.com');
    const resent = await request(app).post(`/api/landlord/caretakers/${caretaker._id}/resend-invitation`).set('Authorization', `Bearer ${await landlordSession()}`);
    await activate('code.quiet@gmail.com', resent.body.data.activationCode);

    const logged = JSON.stringify([...logSpy.mock.calls, ...errorSpy.mock.calls]);
    for (const code of [activationCode, resent.body.data.activationCode]) {
      expect(logged).not.toContain(code);
      expect(logged).not.toContain(code.replace('-', ''));
    }
  }, 30000);
});

describe('5.4 activation with email, code and a new password', () => {
  test('the code works once, in any case and with or without the dash; it writes CARETAKER_ACTIVATED and the caretaker can sign in', async () => {
    const { caretaker, activationCode } = await invite('code.once@gmail.com');

    const res = await activate('code.once@gmail.com', activationCode.toLowerCase().replace('-', ''));

    expect(res.status).toBe(200);
    const stored = await UserRepository.findByIdWithSecrets(caretaker._id);
    expect(stored.accountStatus).toBe('active');
    expect(stored.activatedAt).toBeInstanceOf(Date);
    expect(stored.otp.codeHash).toBeNull();
    expect((await login('code.once@gmail.com', NEW_PASSWORD)).status).toBe(200);
    expectGeneric(await activate('code.once@gmail.com', activationCode, 'An0ther!Pass'));
    expect((await login('code.once@gmail.com', NEW_PASSWORD)).status).toBe(200); // the second try changed nothing
    const audit = await AuditLogRepository.findRecent({ action: 'CARETAKER_ACTIVATED' });
    expect(audit.some((l) => String(l.targetId) === String(caretaker._id))).toBe(true);
  }, 30000);

  test('activation forces a strong new password: the old shared password is refused', async () => {
    const { activationCode } = await invite('code.weak@gmail.com');

    const res = await activate('code.weak@gmail.com', activationCode, LEGACY_SHARED_PASSWORD);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await UserRepository.findByEmail('code.weak@gmail.com')).accountStatus).toBe('pending_activation');
  }, 30000);

  test('the code still works just before 72 hours and not after', async () => {
    const early = await invite('code.early@gmail.com');
    const late = await invite('code.late@gmail.com');
    const start = Date.now();

    jest.spyOn(Date, 'now').mockImplementation(() => start + 71 * HOUR_MS);
    expect((await activate('code.early@gmail.com', early.activationCode)).status).toBe(200);
    Date.now.mockImplementation(() => start + 73 * HOUR_MS);
    expectGeneric(await activate('code.late@gmail.com', late.activationCode));
  }, 30000);

  test('wrong codes, unknown emails, other roles, active accounts and other kinds of code all get the same generic error', async () => {
    const { activationCode } = await invite('code.wrong@gmail.com');
    const known = 'ABCDE-FGHJK';
    const slot = async (purpose) => ({ codeHash: await hashOtp('ABCDEFGHJK'), purpose, expiresAt: new Date(Date.now() + HOUR_MS), attempts: 0 });
    await makeUser('code.tenant@gmail.com', { role: 'tenant', accountStatus: 'pending_activation', otp: await slot('caretaker_activation') });
    await makeUser('code.active@gmail.com', { otp: await slot('caretaker_activation') });
    await makeUser('code.reset@gmail.com', { accountStatus: 'pending_activation', otp: await slot('password_reset') });

    const responses = [
      await activate('code.wrong@gmail.com', 'ZZZZZ-ZZZZZ'),
      await activate('nobody.code@gmail.com', activationCode),
      await activate('code.tenant@gmail.com', known),
      await activate('code.active@gmail.com', known),
      await activate('code.reset@gmail.com', known),
    ];

    for (const res of responses) {
      expectGeneric(res);
      expect(res.body).toEqual(responses[0].body);
    }
    expect((await UserRepository.findByEmail('code.wrong@gmail.com')).accountStatus).toBe('pending_activation');
    expect((await UserRepository.findByEmail('code.tenant@gmail.com')).accountStatus).toBe('pending_activation');
    expect((await login('code.active@gmail.com', PASSWORD)).status).toBe(200); // password unchanged
  }, 30000);

  test('two activations racing with the same code: exactly one wins', async () => {
    const { activationCode } = await invite('code.race@gmail.com');

    const results = await Promise.all([
      activate('code.race@gmail.com', activationCode, 'First!Pass1'),
      activate('code.race@gmail.com', activationCode, 'Second!Pass2'),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    const winner = results[0].status === 200 ? 'First!Pass1' : 'Second!Pass2';
    expect((await login('code.race@gmail.com', winner)).status).toBe(200);
  }, 30000);

  test('the old activation-link request (token and password) no longer activates anything', async () => {
    const { caretaker } = await invite('code.oldlink@gmail.com');

    const res = await request(app).post('/api/auth/activate-caretaker').send({ token: 'any.old.link-token', password: NEW_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect((await UserRepository.findById(caretaker._id)).accountStatus).toBe('pending_activation');
  }, 30000);
});
