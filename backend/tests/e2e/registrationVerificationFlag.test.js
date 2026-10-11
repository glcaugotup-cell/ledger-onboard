// Sign-up with EMAIL_VERIFICATION_REQUIRED off (the default) and on, side by side.
// Pinned off here so a developer's own .env can't change what these tests check.
process.env.EMAIL_VERIFICATION_REQUIRED = 'false';
// Many auth calls share one app; keep the shared and code-related limiters out of the way.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;
let env;
let EmailService;
let UserRepository;
let hashPassword;
let hashOtp;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  env = require('../../config/env');
  EmailService = require('../../services/EmailService');
  UserRepository = require('../../repositories/UserRepository');
  ({ hashPassword } = require('../../utils/password'));
  ({ hashOtp } = require('../../utils/otp'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const PASSWORD = 'Str0ng!Pass';
const ALREADY_REGISTERED = 'This email is already registered. Please log in instead.';
let phoneSeq = 0;

function tenantPayload(email) {
  phoneSeq += 1;
  return {
    firstName: 'Reg',
    lastName: 'Tenant',
    email,
    phone: `0917666${String(phoneSeq).padStart(4, '0')}`,
    password: PASSWORD,
    role: 'tenant',
    privacyConsent: true,
    emergencyContact: { name: 'Ana Tenant', phone: '09171234598' },
  };
}

/** An account left pending (emailVerified:false) by the old sign-up flow, with a still-valid code on it. */
async function makePendingUser(email) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Pending',
    lastName: 'User',
    fullName: 'Pending User',
    email,
    phone: `0917666${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role: 'tenant',
    accountStatus: 'active',
    emailVerified: false,
    emergencyContact: { name: 'Ana Tenant', phone: '09171234598' },
    otp: { codeHash: await hashOtp('123456'), purpose: 'email_verification', expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 },
  });
}

const login = (email) => request(app).post('/api/auth/login').send({ email, password: PASSWORD });

describe('EMAIL_VERIFICATION_REQUIRED off (default)', () => {
  test('a new account can sign in at once and no code is sent', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');

    const reg = await request(app).post('/api/auth/register').send(tenantPayload('fresh.tenant@gmail.com'));

    expect(reg.status).toBe(201);
    expect(reg.body.data.verificationRequired).toBe(false);
    expect(reg.body.data.user.emailVerified).toBe(true);
    expect(sendSpy).not.toHaveBeenCalled();
    const stored = await UserRepository.findByEmail('fresh.tenant@gmail.com', { withSecrets: true });
    expect(stored.otp.codeHash).toBeNull();

    const res = await login('fresh.tenant@gmail.com');
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  }, 30000);

  test('registering again with a registered email gets ACCOUNT_EXISTS and sends nothing', async () => {
    await request(app).post('/api/auth/register').send(tenantPayload('twice.tenant@gmail.com'));
    const sendSpy = jest.spyOn(EmailService, 'send');

    const again = await request(app).post('/api/auth/register').send(tenantPayload('twice.tenant@gmail.com'));

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ACCOUNT_EXISTS');
    expect(again.body.error.message).toBe(ALREADY_REGISTERED);
    expect(sendSpy).not.toHaveBeenCalled();
  }, 30000);

  test('an account still pending from before can sign in (no EMAIL_NOT_VERIFIED)', async () => {
    await makePendingUser('stuck.pending@gmail.com');

    const res = await login('stuck.pending@gmail.com');

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
  }, 30000);

  test('registering again with a pending account\'s email gets the same answer as any registered email and sends nothing', async () => {
    await makePendingUser('pending.again@gmail.com');
    const sendSpy = jest.spyOn(EmailService, 'send');

    const again = await request(app).post('/api/auth/register').send(tenantPayload('pending.again@gmail.com'));

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ACCOUNT_EXISTS');
    expect(again.body.error.message).toBe(ALREADY_REGISTERED);
    expect(sendSpy).not.toHaveBeenCalled();
    expect(await UserRepository.findByEmail('pending.again@gmail.com')).toBeTruthy(); // nothing deleted
  }, 30000);

  test('resend-otp answers pending, verified and unknown emails identically and sends nothing', async () => {
    await makePendingUser('resend.pending@gmail.com');
    await request(app).post('/api/auth/register').send(tenantPayload('resend.verified@gmail.com'));
    const sendSpy = jest.spyOn(EmailService, 'send');

    const responses = await Promise.all(
      ['resend.pending@gmail.com', 'resend.verified@gmail.com', 'nobody.here@gmail.com'].map((email) => request(app).post('/api/auth/resend-otp').send({ email }))
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(responses[0].body.data);
    }
    expect(responses[0].body.data.message).toBe('If a matching pending registration exists, a new code has been sent.');
    expect(sendSpy).not.toHaveBeenCalled();
  }, 30000);

  test('verify-otp for sign-up answers pending, verified and unknown emails with the same generic error', async () => {
    await makePendingUser('verify.pending@gmail.com');
    await request(app).post('/api/auth/register').send(tenantPayload('verify.verified@gmail.com'));

    const responses = await Promise.all(
      ['verify.pending@gmail.com', 'verify.verified@gmail.com', 'nobody.else@gmail.com'].map((email) =>
        // 123456 is the pending account's real, unexpired code: even that gets the generic answer.
        request(app).post('/api/auth/verify-otp').send({ email, code: '123456', purpose: 'email_verification' })
      )
    );

    for (const res of responses) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_OTP');
      expect(res.body.error.message).toBe('Invalid or expired code');
    }
  }, 30000);

  test('cancel-registration deletes nothing and answers pending, verified and unknown emails identically', async () => {
    const pending = await makePendingUser('cancel.off.pending@gmail.com');
    await request(app).post('/api/auth/register').send(tenantPayload('cancel.off.verified@gmail.com'));

    const responses = await Promise.all(
      ['cancel.off.pending@gmail.com', 'cancel.off.verified@gmail.com', 'nobody.cancel@gmail.com'].map((email) => request(app).post('/api/auth/cancel-registration').send({ email }))
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(responses[0].body.data);
    }
    expect(responses[0].body.data.message).toBe('Registration cancelled. You can register again with the correct information.');
    // The pending account may already have history, so it stays, and can still sign in.
    expect(await UserRepository.findById(pending._id)).toBeTruthy();
    expect(await UserRepository.findByEmail('cancel.off.verified@gmail.com')).toBeTruthy();
    expect((await login('cancel.off.pending@gmail.com')).status).toBe(200);
  }, 30000);
});

describe('EMAIL_VERIFICATION_REQUIRED on (today\'s behaviour)', () => {
  beforeAll(() => {
    env.emailVerificationRequired = true;
  });

  afterAll(() => {
    env.emailVerificationRequired = false;
  });

  test('registering sends a code and says so; sign-in waits until the code is entered', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');

    const reg = await request(app).post('/api/auth/register').send(tenantPayload('flagon.tenant@gmail.com'));

    expect(reg.status).toBe(201);
    expect(reg.body.data.verificationRequired).toBe(true);
    expect(reg.body.data.user.emailVerified).toBe(false);
    const call = sendSpy.mock.calls.find((c) => c[0].to === 'flagon.tenant@gmail.com');
    expect(call).toBeTruthy();
    const code = call[0].text.match(/\d{6}/)[0];

    const blocked = await login('flagon.tenant@gmail.com');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    // Registering again while pending resumes verification instead of reporting a registered email.
    const again = await request(app).post('/api/auth/register').send(tenantPayload('flagon.tenant@gmail.com'));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ACCOUNT_PENDING_VERIFICATION');

    const verify = await request(app).post('/api/auth/verify-otp').send({ email: 'flagon.tenant@gmail.com', code, purpose: 'email_verification' });
    expect(verify.status).toBe(200);
    expect((await login('flagon.tenant@gmail.com')).status).toBe(200);

    const afterVerify = await request(app).post('/api/auth/register').send(tenantPayload('flagon.tenant@gmail.com'));
    expect(afterVerify.body.error.code).toBe('ACCOUNT_EXISTS');
  }, 30000);

  test('an account still pending from before is blocked from signing in', async () => {
    await makePendingUser('flagon.pending@gmail.com');

    const res = await login('flagon.pending@gmail.com');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  }, 30000);

  test('cancel-registration deletes only a pending account and answers every email identically', async () => {
    const pending = await makePendingUser('cancel.on.pending@gmail.com');
    const verified = await UserRepository.create({
      firstName: 'Verified', lastName: 'User', fullName: 'Verified User', email: 'cancel.on.verified@gmail.com', phone: '09176669999',
      passwordHash: await hashPassword(PASSWORD), role: 'tenant', accountStatus: 'active', emailVerified: true,
      emergencyContact: { name: 'Ana Tenant', phone: '09171234598' },
    });

    const responses = await Promise.all(
      ['cancel.on.pending@gmail.com', 'cancel.on.verified@gmail.com', 'nobody.cancel.on@gmail.com'].map((email) => request(app).post('/api/auth/cancel-registration').send({ email }))
    );

    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(responses[0].body.data);
    }
    expect(await UserRepository.findById(pending._id)).toBeNull();
    expect(await UserRepository.findById(verified._id)).toBeTruthy();
  }, 30000);
});
