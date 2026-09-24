const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
const EmailService = require('../../services/EmailService');
const UserRepository = require('../../repositories/UserRepository');

let app;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

/** Registers, captures the emailed OTP, but deliberately does NOT verify — these tests exercise the still-pending window. */
async function registerUnverified(payload) {
  const sendSpy = jest.spyOn(EmailService, 'send');
  const reg = await request(app).post('/api/auth/register').send(payload);
  const call = sendSpy.mock.calls.find((c) => c[0].to === payload.email);
  const code = call[0].text.match(/\d{6}/)[0];
  sendSpy.mockRestore();
  return { reg, code };
}

const basePayload = (email, phone) => ({
  firstName: 'Cancel', lastName: 'Test', email, phone, password: 'Str0ng!Pass', role: 'tenant',
  privacyConsent: true, emergencyContact: { name: 'Backup Person', phone: '09171234599' },
});

describe('Registration cancellation', () => {
  test('cancelling deletes the still-unverified account, so the same email can register again', async () => {
    const email = 'cancel.retry@gmail.com';
    const { reg } = await registerUnverified(basePayload(email, '09171234520'));
    expect(reg.status).toBe(201);

    const cancelRes = await request(app).post('/api/auth/cancel-registration').send({ email });
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.message).toMatch(/registration cancelled/i);

    // The account is really gone, not just "cancelled" in name only.
    const loginAttempt = await request(app).post('/api/auth/login').send({ email, password: 'Str0ng!Pass' });
    expect(loginAttempt.status).toBe(401);
    expect(loginAttempt.body.error.code).toBe('EMAIL_NOT_REGISTERED');

    // Re-registering with the exact same email now succeeds instead of 409 ACCOUNT_EXISTS.
    const secondReg = await request(app).post('/api/auth/register').send(basePayload(email, '09171234520'));
    expect(secondReg.status).toBe(201);
  });

  test('the OTP issued before cancellation cannot be used afterward', async () => {
    const email = 'cancel.staleotp@gmail.com';
    const { code } = await registerUnverified(basePayload(email, '09171234521'));

    await request(app).post('/api/auth/cancel-registration').send({ email });

    const verifyAttempt = await request(app).post('/api/auth/verify-otp').send({ email, code, purpose: 'email_verification' });
    expect(verifyAttempt.status).toBe(400);
    expect(verifyAttempt.body.error.code).toBe('INVALID_OTP');
  });

  test('cancelling a non-existent or already-verified account is a harmless no-op (same response either way, no account details leaked)', async () => {
    // Never registered at all.
    const neverRegistered = await request(app).post('/api/auth/cancel-registration').send({ email: 'never.existed@gmail.com' });
    expect(neverRegistered.status).toBe(200);
    expect(neverRegistered.body.data.message).toMatch(/registration cancelled/i);

    // A real, already-verified account must survive a cancel call against its email.
    const email = 'cancel.verified@gmail.com';
    const { reg, code } = await registerUnverified(basePayload(email, '09171234522'));
    await request(app).post('/api/auth/verify-otp').send({ email, code, purpose: 'email_verification' });

    const cancelOnVerified = await request(app).post('/api/auth/cancel-registration').send({ email });
    expect(cancelOnVerified.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email, password: 'Str0ng!Pass' });
    expect(login.status).toBe(200);
    void reg;
  });
});

describe('Re-registering while a verification is already pending', () => {
  test('does not create a duplicate account — re-issues a fresh OTP and reports ACCOUNT_PENDING_VERIFICATION', async () => {
    const email = 'pending.resume@gmail.com';
    const { code: firstCode } = await registerUnverified(basePayload(email, '09171234530'));

    // Push the first OTP's issue time back past the 45s resend cooldown
    // (same backdating technique as the "Expired OTP" tests below) so the
    // second register() call is free to actually re-issue rather than being
    // silently skipped by the cooldown — that specific "skipped" case is
    // covered separately by the cooldown test further down.
    const pendingUser = await UserRepository.findByEmail(email, { withSecrets: true });
    await UserRepository.updateById(pendingUser._id, { 'otp.expiresAt': new Date(pendingUser.otp.expiresAt.getTime() - 46 * 1000) });

    const secondSendSpy = jest.spyOn(EmailService, 'send');
    const secondReg = await request(app).post('/api/auth/register').send(basePayload(email, '09171234530'));
    expect(secondReg.status).toBe(409);
    expect(secondReg.body.error.code).toBe('ACCOUNT_PENDING_VERIFICATION');

    // A fresh code was actually emailed for the same still-pending account...
    const secondCall = secondSendSpy.mock.calls.find((c) => c[0].to === email);
    expect(secondCall).toBeDefined();
    const secondCode = secondCall[0].text.match(/\d{6}/)[0];
    secondSendSpy.mockRestore();

    // ...the same account still exists (register() did not create a duplicate)...
    const stillPendingUser = await UserRepository.findByEmail(email);
    expect(stillPendingUser).toBeTruthy();
    expect(stillPendingUser.emailVerified).toBe(false);

    // ...the old code from the first register() call is now dead...
    const staleAttempt = await request(app).post('/api/auth/verify-otp').send({ email, code: firstCode, purpose: 'email_verification' });
    expect(staleAttempt.status).toBe(400);
    expect(staleAttempt.body.error.code).toBe('INVALID_OTP');

    // ...and the fresh code from the re-registration attempt verifies the account.
    const verify = await request(app).post('/api/auth/verify-otp').send({ email, code: secondCode, purpose: 'email_verification' });
    expect(verify.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email, password: 'Str0ng!Pass' });
    expect(login.status).toBe(200);
  });

  test('re-registering an already-verified email still returns the plain ACCOUNT_EXISTS conflict, with no OTP re-issued', async () => {
    const email = 'pending.verified@gmail.com';
    const { code } = await registerUnverified(basePayload(email, '09171234531'));
    await request(app).post('/api/auth/verify-otp').send({ email, code, purpose: 'email_verification' });

    const sendSpy = jest.spyOn(EmailService, 'send');
    const secondReg = await request(app).post('/api/auth/register').send(basePayload(email, '09171234531'));
    expect(secondReg.status).toBe(409);
    expect(secondReg.body.error.code).toBe('ACCOUNT_EXISTS');
    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  test('re-registering within the resend cooldown does not spam a second email, but still resumes the verify flow', async () => {
    const email = 'pending.cooldown@gmail.com';
    await registerUnverified(basePayload(email, '09171234532'));

    const sendSpy = jest.spyOn(EmailService, 'send');
    const secondReg = await request(app).post('/api/auth/register').send(basePayload(email, '09171234532'));
    expect(secondReg.status).toBe(409);
    expect(secondReg.body.error.code).toBe('ACCOUNT_PENDING_VERIFICATION');
    expect(sendSpy).not.toHaveBeenCalled(); // still within the 45s resend cooldown from the first register() call
    sendSpy.mockRestore();
  });
});

describe('Name normalization (frontend and backend must agree)', () => {
  test.each([
    ['angelo', 'Angelo', 'name.case1'],
    // The register endpoint lowercases email before checking uniqueness
    // (Section 4), so this must use a distinct address from the "angelo"
    // case above even though both inputs are the same word — otherwise
    // both attempts collide on the same normalized email and the second
    // one fails with 409 ACCOUNT_EXISTS, not the thing this test checks.
    ['ANGELO', 'Angelo', 'name.case2'],
    ['juan dela cruz', 'Juan Dela Cruz', 'name.case3'],
    ['mary-ann', 'Mary-Ann', 'name.case4'],
    ['st. john', 'St. John', 'name.case5'],
  ])('firstName "%s" is normalized to "%s" and the account is created successfully', async (input, expected, emailSlug) => {
    const email = `${emailSlug}@gmail.com`;
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...basePayload(email, '09171234530'), firstName: input });
    expect(res.status).toBe(201);
    expect(res.body.data.user.firstName).toBe(expected);
  });

  test.each(['Angelo123', '1Angelo', 'A', 'Angelo!'])('firstName "%s" is still rejected after normalization', async (input) => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...basePayload('name.rejected@gmail.com', '09171234531'), firstName: input });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('Phone normalization (frontend and backend must agree)', () => {
  test.each([
    ['09235753673', '+639235753673'],
    ['9235753673', '+639235753673'],
    ['+639235753673', '+639235753673'],
  ])('phone "%s" is normalized to "%s" and stored that way', async (input, expected) => {
    const email = `phone.${input.replace(/\D/g, '')}@gmail.com`;
    const res = await request(app).post('/api/auth/register').send({ ...basePayload(email, input) });
    expect(res.status).toBe(201);
    expect(res.body.data.user.phone).toBe(expected);
  });

  test('an incomplete phone number is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...basePayload('phone.incomplete@gmail.com', '0923575367') }); // only 10 digits after the leading 0
    expect(res.status).toBe(400);
  });

  test('a phone number containing letters is rejected', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...basePayload('phone.letters@gmail.com', '0923575ABCD') });
    expect(res.status).toBe(400);
  });
});

describe('Expired OTP', () => {
  test('an OTP past its expiry is rejected even with the correct code', async () => {
    const email = 'otp.expired@gmail.com';
    const { code } = await registerUnverified(basePayload(email, '09171234540'));

    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    await UserRepository.updateById(user._id, { 'otp.expiresAt': new Date(Date.now() - 60 * 1000) });

    const verifyAttempt = await request(app).post('/api/auth/verify-otp').send({ email, code, purpose: 'email_verification' });
    expect(verifyAttempt.status).toBe(400);
    expect(verifyAttempt.body.error.code).toBe('INVALID_OTP');
  });

  test('an incorrect OTP is rejected', async () => {
    const email = 'otp.incorrect@gmail.com';
    await registerUnverified(basePayload(email, '09171234541'));

    const verifyAttempt = await request(app).post('/api/auth/verify-otp').send({ email, code: '000000', purpose: 'email_verification' });
    expect(verifyAttempt.status).toBe(400);
    expect(verifyAttempt.body.error.code).toBe('INVALID_OTP');
  });
});
