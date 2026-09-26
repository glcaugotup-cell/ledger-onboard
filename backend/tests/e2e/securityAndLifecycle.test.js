const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

// This file makes far more than 10 /api/auth/* calls across its functional
// tests (register/login/MFA/etc. all share one authRateLimiter instance on
// one long-lived `app`). Raise the ceiling for those so they don't trip the
// limiter mid-file; the dedicated rate-limiting test below builds its own
// isolated low-ceiling instance instead of relying on this global one.
process.env.AUTH_RATE_LIMIT_MAX = '1000';

let app;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

/**
 * Registration now requires OTP email verification before login works
 * anywhere in the app. Every one of this file's many register-then-login
 * fixtures needs the same capture-code-and-verify step, so it's factored
 * out here once rather than repeated ~10 times. Spies on EmailService.send
 * for just the duration of this call and restores it immediately after, so
 * it composes safely with tests that independently spy on the same method
 * afterward (e.g. the MFA test, the day-25 inactivity-email test).
 */
async function registerAndVerify(payload) {
  // eslint-disable-next-line global-require
  const EmailService = require('../../services/EmailService');
  const sendSpy = jest.spyOn(EmailService, 'send');
  const reg = await request(app).post('/api/auth/register').send(payload);
  if (reg.status === 201) {
    const call = sendSpy.mock.calls.find((c) => c[0].to === payload.email);
    const code = call[0].text.match(/\d{6}/)[0];
    await request(app).post('/api/auth/verify-otp').send({ email: payload.email, code, purpose: 'email_verification' });
  }
  sendSpy.mockRestore();
  return reg;
}

describe('Security — email-OTP MFA login', () => {
  test('enabling MFA requires a verification code to complete login', async () => {
    const reg = await registerAndVerify({
      firstName: 'Mfa', lastName: 'User',
      email: 'mfa.user@gmail.com',
      phone: '09171234501',
      password: 'Str0ng!Pass',
      role: 'tenant',
      privacyConsent: true,
      emergencyContact: { name: 'Ana User', phone: '09171234598' },
    });

    const firstLogin = await request(app).post('/api/auth/login').send({ email: 'mfa.user@gmail.com', password: 'Str0ng!Pass' });
    const token = firstLogin.body.data.accessToken;

    await request(app).patch('/api/auth/mfa').set('Authorization', `Bearer ${token}`).send({ enabled: true });

    const EmailService = require('../../services/EmailService');
    const sendSpy = jest.spyOn(EmailService, 'send');

    const login = await request(app).post('/api/auth/login').send({ email: 'mfa.user@gmail.com', password: 'Str0ng!Pass' });
    expect(login.status).toBe(200);
    expect(login.body.data.mfaRequired).toBe(true);
    expect(login.body.data.accessToken).toBeUndefined();

    const otpText = sendSpy.mock.calls.find((c) => c[0].to === 'mfa.user@gmail.com')[0].text;
    const code = otpText.match(/\d{6}/)[0];

    const wrongCode = await request(app).post('/api/auth/verify-otp').send({ email: 'mfa.user@gmail.com', code: '000000', purpose: 'login_mfa' });
    expect(wrongCode.status).toBe(400);

    const verify = await request(app).post('/api/auth/verify-otp').send({ email: 'mfa.user@gmail.com', code, purpose: 'login_mfa' });
    expect(verify.status).toBe(200);
    expect(verify.body.data.accessToken).toBeTruthy();

    sendSpy.mockRestore();
    void reg;
  });
});

describe('Account inactivity lifecycle (Section 7)', () => {
  const UserRepository = require('../../repositories/UserRepository');
  const AuditLogRepository = require('../../repositories/AuditLogRepository');
  const AccountLifecycleService = require('../../services/AccountLifecycleService');
  const EmailService = require('../../services/EmailService');
  const { VERIFICATION_STATUS } = require('../../utils/constants');

  test('day-25 inactivity sends a warning email and logs it; activity resets the timer', async () => {
    const reg = await registerAndVerify({
      firstName: 'Idle', lastName: 'Tenant',
      email: 'idle.tenant@gmail.com',
      phone: '09171234502',
      password: 'Str0ng!Pass',
      role: 'tenant',
      privacyConsent: true,
      emergencyContact: { name: 'Ben Tenant', phone: '09171234597' },
    });
    const userId = reg.body.data.user._id;

    const twentySixDaysAgo = new Date(Date.now() - 26 * 24 * 60 * 60 * 1000);
    await UserRepository.updateById(userId, { lastActivityAt: twentySixDaysAgo });

    const sendSpy = jest.spyOn(EmailService, 'send');
    const results = await AccountLifecycleService.runDailySweep();
    expect(results.warned).toBeGreaterThanOrEqual(1);
    expect(sendSpy.mock.calls.some((c) => c[0].to === 'idle.tenant@gmail.com' && /archived/i.test(c[0].subject))).toBe(true);
    sendSpy.mockRestore();

    let user = await UserRepository.findById(userId);
    expect(user.archiveWarningSentAt).toBeTruthy();
    expect(user.accountStatus).toBe('active');

    const warningLog = await AuditLogRepository.findRecent({ action: 'ACCOUNT_ARCHIVE_WARNING_SENT' });
    expect(warningLog.some((l) => String(l.targetId) === String(userId))).toBe(true);

    // Qualifying activity (a login) resets the timer and clears the pending warning.
    await request(app).post('/api/auth/login').send({ email: 'idle.tenant@gmail.com', password: 'Str0ng!Pass' });
    user = await UserRepository.findById(userId);
    expect(user.archiveWarningSentAt).toBeNull();
    expect(user.accountStatus).toBe('active');
  }, 20000);

  test('day-30 inactivity archives the account and blocks login; archived tenant\'s approved review stays visible', async () => {
    // Full flow: register -> approve a stay -> complete it -> review it -> approve the review -> then archive the tenant.
    const landlordReg = await registerAndVerify({
      firstName: 'Archive', lastName: 'Landlord', email: 'archive.landlord@gmail.com', phone: '09171234503', password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
    });
    void landlordReg;
    const landlordLogin = await request(app).post('/api/auth/login').send({ email: 'archive.landlord@gmail.com', password: 'Str0ng!Pass' });
    const landlordToken = landlordLogin.body.data.accessToken;
    await UserRepository.updateById(landlordLogin.body.data.user._id, { businessVerificationStatus: VERIFICATION_STATUS.VERIFIED });

    const tenantReg = await registerAndVerify({
      firstName: 'Archive', lastName: 'Tenant', email: 'archive.tenant@gmail.com', phone: '09171234504', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Cara Tenant', phone: '09171234596' },
    });
    const tenantId = tenantReg.body.data.user._id;
    const tenantLogin = await request(app).post('/api/auth/login').send({ email: 'archive.tenant@gmail.com', password: 'Str0ng!Pass' });
    const tenantToken = tenantLogin.body.data.accessToken;

    const propRes = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .field('propertyName', 'Archive Test House')
      .field('address[street]', '1 Test St')
      .field('address[barangay]', 'Poblacion Oeste')
      .field('locationCoordinates[lat]', '16.04')
      .field('locationCoordinates[lng]', '120.33')
      .field('propertyType', 'Bedspace')
      .field('tenantGenderPolicy', 'Co-Ed');
    const propertyId = propRes.body.data.property._id;

    const AdminApiUser = await UserRepository.create({
      firstName: 'Archive', lastName: 'Admin', fullName: 'Archive Admin', email: 'archive.admin@gmail.com', phone: '09171234505', passwordHash: (await require('../../utils/password').hashPassword('Str0ng!Pass')), role: 'admin',
    });
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'archive.admin@gmail.com', password: 'Str0ng!Pass' });
    const adminToken = adminLogin.body.data.accessToken;
    await request(app).patch(`/api/admin/properties/${propertyId}/moderate`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'approved' });

    const roomRes = await request(app)
      .post(`/api/properties/${propertyId}/rooms`)
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ roomNumber: '1', capacity: 1, monthlyBaseRent: 2000 });
    const roomId = roomRes.body.data.room._id;

    const reserveRes = await request(app).post('/api/reservations').set('Authorization', `Bearer ${tenantToken}`).send({ roomId, moveInDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) });
    const reservationId = reserveRes.body.data.reservation._id;
    await request(app).patch(`/api/reservations/${reservationId}/status`).set('Authorization', `Bearer ${landlordToken}`).send({ status: 'approved' });
    await request(app).patch(`/api/reservations/${reservationId}/status`).set('Authorization', `Bearer ${landlordToken}`).send({ status: 'completed' });

    const reviewRes = await request(app)
      .post(`/api/properties/${propertyId}/reviews`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ reservationId, rating: 5, comment: 'Great stay' });
    const reviewId = reviewRes.body.data.review._id;
    await request(app).patch(`/api/reviews/${reviewId}/moderate`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });

    // Push the tenant 31 days inactive and run the sweep -> should archive.
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await UserRepository.updateById(tenantId, { lastActivityAt: thirtyOneDaysAgo });
    const results = await AccountLifecycleService.runDailySweep();
    expect(results.archived).toBeGreaterThanOrEqual(1);

    const archivedUser = await UserRepository.findById(tenantId);
    expect(archivedUser.accountStatus).toBe('archived');

    const archiveLog = await AuditLogRepository.findRecent({ action: 'ACCOUNT_ARCHIVED' });
    expect(archiveLog.some((l) => String(l.targetId) === String(tenantId))).toBe(true);

    // Login is now blocked for the archived tenant.
    const blockedLogin = await request(app).post('/api/auth/login').send({ email: 'archive.tenant@gmail.com', password: 'Str0ng!Pass' });
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.error.code).toBe('ACCOUNT_ARCHIVED');

    // The archived tenant's approved review is still visible and still labeled verified.
    const publicReviews = await request(app).get(`/api/properties/${propertyId}/reviews`);
    const found = publicReviews.body.data.reviews.find((r) => r._id === reviewId);
    expect(found).toBeTruthy();
    expect(found.isVerifiedFormerTenant).toBe(true);

    // Recovery path brings it back.
    const recovered = await request(app).post('/api/auth/account-recovery').send({ email: 'archive.tenant@gmail.com', newPassword: 'NewStr0ng!Pass' });
    expect(recovered.status).toBe(200);
    const recoveredLogin = await request(app).post('/api/auth/login').send({ email: 'archive.tenant@gmail.com', password: 'NewStr0ng!Pass' });
    expect(recoveredLogin.status).toBe(200);

    void AdminApiUser;
  }, 30000);
});

describe('Caretaker creation is audited and landlord-owned only', () => {
  test('caretaker creation writes an audit entry visible to admin', async () => {
    const landlordReg = await registerAndVerify({
      firstName: 'Audit', lastName: 'Landlord', email: 'audit.landlord@gmail.com', phone: '09171234506', password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
    });
    void landlordReg;
    const landlordLogin = await request(app).post('/api/auth/login').send({ email: 'audit.landlord@gmail.com', password: 'Str0ng!Pass' });
    const landlordToken = landlordLogin.body.data.accessToken;

    const createRes = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Audit', lastName: 'Caretaker', email: 'audit.caretaker@gmail.com', phone: '09171234507', serviceBarangay: 'Poblacion Oeste' });
    expect(createRes.status).toBe(201);
    const caretakerId = createRes.body.data.caretaker._id;

    const UserRepository = require('../../repositories/UserRepository');
    const caretaker = await UserRepository.findById(caretakerId);
    expect(String(caretaker.assignedLandlordId)).toBeTruthy();

    const AdminUser = await UserRepository.create({
      firstName: 'Audit', lastName: 'Admin', fullName: 'Audit Admin', email: 'audit.admin@gmail.com', phone: '09171234508', passwordHash: (await require('../../utils/password').hashPassword('Str0ng!Pass')), role: 'admin',
    });
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'audit.admin@gmail.com', password: 'Str0ng!Pass' });
    const logsRes = await request(app).get('/api/admin/logs?action=CARETAKER_CREATED').set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`);
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.data.logs.some((l) => String(l.targetId) === String(caretakerId))).toBe(true);
    void AdminUser;
  });
});

describe('RBAC — role-gated routes reject the wrong role', () => {
  test('a tenant hitting an admin-only route gets 403', async () => {
    await registerAndVerify({
      firstName: 'Rbac', lastName: 'Tenant', email: 'rbac.tenant@gmail.com', phone: '09171234509', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Dodong Tenant', phone: '09171234595' },
    });
    const login = await request(app).post('/api/auth/login').send({ email: 'rbac.tenant@gmail.com', password: 'Str0ng!Pass' });
    const token = login.body.data.accessToken;

    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  test('a tenant (non-landlord) cannot create a caretaker', async () => {
    await registerAndVerify({
      firstName: 'Rbac', lastName: 'Tenant Two', email: 'rbac.tenant2@gmail.com', phone: '09171234510', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Elmo Tenant', phone: '09171234594' },
    });
    const login = await request(app).post('/api/auth/login').send({ email: 'rbac.tenant2@gmail.com', password: 'Str0ng!Pass' });
    const token = login.body.data.accessToken;

    const res = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Should', lastName: 'Not Work', email: 'should.not.work@gmail.com', phone: '09171234511', serviceBarangay: 'Poblacion Oeste' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });
});

describe('JWT — expiry is enforced, not just presence', () => {
  test('an expired but validly-signed token is rejected with 401, distinctly from a missing one', async () => {
    // eslint-disable-next-line global-require
    const jwt = require('jsonwebtoken');
    // eslint-disable-next-line global-require
    const env = require('../../config/env');

    const expiredToken = jwt.sign(
      { sub: '000000000000000000000000', role: 'tenant', accountStatus: 'active', exp: Math.floor(Date.now() / 1000) - 60 },
      env.jwtSecret
    );

    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');

    const missingRes = await request(app).get('/api/users/me');
    expect(missingRes.status).toBe(401);
    expect(missingRes.body.error.code).toBe('MISSING_TOKEN');
  });
});

describe('Unregister flow — ineligible tenant', () => {
  test('a tenant with no completed tenancies has no review-eligible reservations', async () => {
    await registerAndVerify({
      firstName: 'Fresh', lastName: 'Tenant', email: 'fresh.tenant@gmail.com', phone: '09171234512', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Faye Tenant', phone: '09171234593' },
    });
    const login = await request(app).post('/api/auth/login').send({ email: 'fresh.tenant@gmail.com', password: 'Str0ng!Pass' });
    const token = login.body.data.accessToken;

    const res = await request(app).get('/api/reviews/eligible').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.eligibleReservations).toEqual([]);
  });
});

describe('Login error differentiation — Section: accurate account-status messaging', () => {
  test('an email with no account gets EMAIL_NOT_REGISTERED, not a generic credentials error', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'never.registered@gmail.com', password: 'Whatever1!' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('EMAIL_NOT_REGISTERED');
    expect(res.body.error.message).toBe('This email is not registered.');
  });

  test('a registered, verified email with the wrong password gets INCORRECT_PASSWORD', async () => {
    await registerAndVerify({
      firstName: 'Login', lastName: 'ErrorTest', email: 'login.errortest@gmail.com', phone: '09171234513', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Ivy Tenant', phone: '09171234591' },
    });

    const res = await request(app).post('/api/auth/login').send({ email: 'login.errortest@gmail.com', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INCORRECT_PASSWORD');
    expect(res.body.error.message).toBe('Incorrect password.');
  });

  test('a registered but unverified email with the correct password still gets EMAIL_NOT_VERIFIED, not INCORRECT_PASSWORD', async () => {
    const email = 'unverified.logintest@gmail.com';
    await request(app).post('/api/auth/register').send({
      firstName: 'Unverified', lastName: 'LoginTest', email, phone: '09171234514', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Jay Tenant', phone: '09171234590' },
    });

    const res = await request(app).post('/api/auth/login').send({ email, password: 'Str0ng!Pass' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('Security — rate limiting', () => {
  test('excessive real login attempts against the actual endpoint return 429 with the standard error shape', async () => {
    // Runs the REAL AuthController.login (same DB connection, same
    // controller/service/repository chain as the live app — no module
    // reset, so nothing gets disconnected) behind a freshly-constructed
    // rate limiter with a low ceiling, so this doesn't depend on how many
    // auth calls earlier tests in this file already made against the
    // shared `app`'s own (deliberately high, see top of file) limiter.
    await registerAndVerify({
      firstName: 'Rate', lastName: 'Limit', email: 'rate.limit@gmail.com', phone: '09171234500', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Gigi Tenant', phone: '09171234592' },
    });

    // eslint-disable-next-line global-require
    const express = require('express');
    // eslint-disable-next-line global-require
    const rateLimit = require('express-rate-limit');
    // eslint-disable-next-line global-require
    const AuthController = require('../../controllers/auth/AuthController');
    // eslint-disable-next-line global-require
    const { errorHandler } = require('../../middleware/errorHandler');

    const lowCeilingLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => res.status(429).json({ success: false, data: null, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } }),
    });

    const miniApp = express();
    miniApp.use(express.json());
    miniApp.use('/api/auth/login', lowCeilingLimiter);
    miniApp.post('/api/auth/login', AuthController.login);
    miniApp.use(errorHandler);

    const attempts = [];
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      attempts.push(await request(miniApp).post('/api/auth/login').send({ email: 'rate.limit@gmail.com', password: 'WrongPassword1!' }));
    }

    // First 3 (within the ceiling) reach the real controller and fail on bad credentials.
    expect(attempts.slice(0, 3).every((r) => r.status === 401)).toBe(true);
    // The 4th trips the limiter before ever reaching AuthController.login.
    expect(attempts[3].status).toBe(429);
    expect(attempts[3].body).toEqual({ success: false, data: null, error: { code: 'RATE_LIMITED', message: expect.any(String) } });
  });

  test('successful logins never count toward the limit, only failed ones do', async () => {
    await registerAndVerify({
      firstName: 'Repeat', lastName: 'Login', email: 'repeat.login@gmail.com', phone: '09171234501', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Gigi Tenant', phone: '09171234593' },
    });

    // eslint-disable-next-line global-require
    const express = require('express');
    // eslint-disable-next-line global-require
    const rateLimit = require('express-rate-limit');
    // eslint-disable-next-line global-require
    const AuthController = require('../../controllers/auth/AuthController');
    // eslint-disable-next-line global-require
    const { errorHandler } = require('../../middleware/errorHandler');

    // Same low ceiling as the test above, but with skipSuccessfulRequests
    // on — mirrors the real authRateLimiter's config (middleware/rateLimit.js).
    const lowCeilingLimiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 3,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      handler: (req, res) => res.status(429).json({ success: false, data: null, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } }),
    });

    const miniApp = express();
    miniApp.use(express.json());
    miniApp.use('/api/auth/login', lowCeilingLimiter);
    miniApp.post('/api/auth/login', AuthController.login);
    miniApp.use(errorHandler);

    // 5 correct-password logins in a row — well past the ceiling of 3 — must
    // all still succeed, since a 2xx response isn't counted at all.
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(miniApp).post('/api/auth/login').send({ email: 'repeat.login@gmail.com', password: 'Str0ng!Pass' });
      expect(res.status).toBe(200);
    }

    // Failed attempts against the same limiter still count and still lock out —
    // this isn't a blanket bypass, only successes are exempt.
    const failures = [];
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      failures.push(await request(miniApp).post('/api/auth/login').send({ email: 'repeat.login@gmail.com', password: 'WrongPassword1!' }));
    }
    expect(failures.slice(0, 3).every((r) => r.status === 401)).toBe(true);
    expect(failures[3].status).toBe(429);
  });

  test('a successful login still resets the caller\'s shared IP auth rate-limit count (used by /register, etc.)', async () => {
    await registerAndVerify({
      firstName: 'Exempt', lastName: 'Login', email: 'exempt.login@gmail.com', phone: '09171234502', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Gigi Tenant', phone: '09171234594' },
    });

    // eslint-disable-next-line global-require
    const { authRateLimiter } = require('../../middleware/rateLimit');
    const resetSpy = jest.spyOn(authRateLimiter, 'resetKey');

    // A wrong-password attempt is a failure on the new per-account lockout,
    // not on authRateLimiter (which now skips /login entirely) — no reset call.
    await request(app).post('/api/auth/login').send({ email: 'exempt.login@gmail.com', password: 'WrongPassword1!' });
    expect(resetSpy).not.toHaveBeenCalled();

    // A successful login still clears the IP's shared authRateLimiter bucket,
    // since /register, /forgot-password, etc. still rely on that limiter.
    const ok = await request(app).post('/api/auth/login').send({ email: 'exempt.login@gmail.com', password: 'Str0ng!Pass' });
    expect(ok.status).toBe(200);
    expect(resetSpy).toHaveBeenCalledTimes(1);

    resetSpy.mockRestore();
  });

  test('10 failed login attempts in a row lock that account out for a fixed cooldown, independent of the IP limiter', async () => {
    await registerAndVerify({
      firstName: 'Locked', lastName: 'Out', email: 'locked.out@gmail.com', phone: '09171234503', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Gigi Tenant', phone: '09171234595' },
    });

    const failures = [];
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      failures.push(await request(app).post('/api/auth/login').send({ email: 'locked.out@gmail.com', password: 'WrongPassword1!' }));
    }
    expect(failures.every((r) => r.status === 401 && r.body.error.code === 'INCORRECT_PASSWORD')).toBe(true);

    // The 11th attempt trips the lockout even with the CORRECT password.
    const locked = await request(app).post('/api/auth/login').send({ email: 'locked.out@gmail.com', password: 'Str0ng!Pass' });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('LOGIN_LOCKED');
    expect(locked.body.error.details.retryAfterSeconds).toBeGreaterThan(0);
  }, 20000);

  test('a successful login resets the per-account failed-attempt count', async () => {
    await registerAndVerify({
      firstName: 'Reset', lastName: 'Count', email: 'reset.count@gmail.com', phone: '09171234504', password: 'Str0ng!Pass', role: 'tenant',
      privacyConsent: true, emergencyContact: { name: 'Gigi Tenant', phone: '09171234596' },
    });

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app).post('/api/auth/login').send({ email: 'reset.count@gmail.com', password: 'WrongPassword1!' });
    }

    const ok = await request(app).post('/api/auth/login').send({ email: 'reset.count@gmail.com', password: 'Str0ng!Pass' });
    expect(ok.status).toBe(200);

    // If the earlier 3 failures had survived the reset, only 7 more would be
    // needed to hit the lockout threshold of 10. All 9 here should still be
    // plain 401s, proving the counter restarted from zero after the success.
    const failures = [];
    for (let i = 0; i < 9; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      failures.push(await request(app).post('/api/auth/login').send({ email: 'reset.count@gmail.com', password: 'WrongPassword1!' }));
    }
    expect(failures.every((r) => r.status === 401)).toBe(true);
  }, 20000);
});
