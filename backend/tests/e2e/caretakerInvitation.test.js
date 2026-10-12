// These tests cover the sign-up email-verification flow, which is off by default; turn it on before anything loads config.
process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
// Keep CORS local while requiring invitations to use the public deployment.
const previousEmailAppUrl = process.env.EMAIL_APP_URL;
process.env.EMAIL_APP_URL = 'https://ledger-onboard.vercel.app/';
const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
const EmailService = require('../../services/EmailService');
const UserRepository = require('../../repositories/UserRepository');
const { VERIFICATION_STATUS } = require('../../utils/constants');

let app;
let landlordToken;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');

  const sendSpy = jest.spyOn(EmailService, 'send');
  await request(app).post('/api/auth/register').send({
    firstName: 'Owner', lastName: 'Landlord', email: 'owner.landlord@gmail.com',
    phone: '09171234580', password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
  });
  const otpCall = sendSpy.mock.calls.find((c) => c[0].to === 'owner.landlord@gmail.com');
  const otp = otpCall[0].text.match(/\d{6}/)[0];
  sendSpy.mockRestore();

  await request(app).post('/api/auth/verify-otp').send({ email: 'owner.landlord@gmail.com', code: otp, purpose: 'email_verification' });
  const user = await UserRepository.findByEmail('owner.landlord@gmail.com');
  await UserRepository.updateById(user._id, { businessVerificationStatus: VERIFICATION_STATUS.VERIFIED });

  const login = await request(app).post('/api/auth/login').send({ email: 'owner.landlord@gmail.com', password: 'Str0ng!Pass' });
  landlordToken = login.body.data.accessToken;
}, 60000);

afterAll(async () => {
  await stopTestDb();
  if (previousEmailAppUrl === undefined) delete process.env.EMAIL_APP_URL;
  else process.env.EMAIL_APP_URL = previousEmailAppUrl;
});

// Phase 5 rule: invitations send no email and carry no shared password. The landlord gets a
// one-time activation code to hand over, and the caretaker activates with email, code and a new password.
describe('Caretaker activation codes', () => {
  const CODE = /^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/;
  const invite = (email, phone) => request(app)
    .post('/api/landlord/caretakers')
    .set('Authorization', `Bearer ${landlordToken}`)
    .send({ firstName: 'Code', lastName: 'Caretaker', email, phone, serviceBarangay: 'Poblacion Oeste' });
  const resend = (id) => request(app).post(`/api/landlord/caretakers/${id}/resend-invitation`).set('Authorization', `Bearer ${landlordToken}`);
  const activate = (email, code, password = 'NewStr0ng!Pass') => request(app).post('/api/auth/activate-caretaker').send({ email, code, password });

  test('creates the caretaker, sends nothing, and returns a one-time activation code to the landlord', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');

    const res = await invite('caretaker.success@gmail.com', '09302845654');

    expect(res.status).toBe(201);
    expect(res.body.data.caretaker.accountStatus).toBe('pending_activation');
    expect(res.body.data.activationCode).toMatch(CODE);
    expect(res.body.data).not.toHaveProperty('temporaryPassword');
    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();
  });

  test('an email failure can no longer undo an invitation: there is nothing to send or roll back', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send').mockRejectedValue(new Error('535 Authentication failed for SMTP account'));

    const res = await invite('caretaker.failure@gmail.com', '09302845655');
    sendSpy.mockRestore();

    expect(res.status).toBe(201);
    expect(sendSpy).not.toHaveBeenCalled();
    expect((await UserRepository.findByEmail('caretaker.failure@gmail.com')).accountStatus).toBe('pending_activation');
  });

  test('resend gives a new code, the old one stops working, and the new one activates the account', async () => {
    const created = await invite('caretaker.resend@gmail.com', '09302845657');
    const oldCode = created.body.data.activationCode;
    const sendSpy = jest.spyOn(EmailService, 'send');

    const res = await resend(created.body.data.caretaker._id);

    expect(res.status).toBe(200);
    expect(res.body.data.activationCode).toMatch(CODE);
    expect(res.body.data.activationCode).not.toBe(oldCode);
    expect(res.body.data.caretaker.invitationResentAt).toBeTruthy();
    expect(sendSpy).not.toHaveBeenCalled();
    sendSpy.mockRestore();

    const withOld = await activate('caretaker.resend@gmail.com', oldCode);
    expect(withOld.status).toBe(400);
    expect(withOld.body.error.code).toBe('INVALID_ACTIVATION_CODE');
    expect((await activate('caretaker.resend@gmail.com', res.body.data.activationCode)).status).toBe(200);
    // The acceptance date is recorded so the landlord can see when they became a caretaker.
    expect((await UserRepository.findByEmail('caretaker.resend@gmail.com')).activatedAt).toBeInstanceOf(Date);

    // Once activated, there is nothing left to resend.
    const again = await resend(created.body.data.caretaker._id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ACTIVATED');
  });

  test("a landlord cannot resend another landlord's caretaker invitation", async () => {
    const created = await invite('caretaker.notyours@gmail.com', '09302845659');
    const caretaker = await UserRepository.findByEmail('caretaker.notyours@gmail.com');
    await UserRepository.updateById(caretaker._id, { assignedLandlordId: caretaker._id });

    const res = await resend(created.body.data.caretaker._id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CARETAKER_NOT_FOUND');
  });

  test('caretaker can activate their account with the code and then log in', async () => {
    const res = await invite('caretaker.activate@gmail.com', '09302845656');

    const activated = await activate('caretaker.activate@gmail.com', res.body.data.activationCode);
    expect(activated.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: 'caretaker.activate@gmail.com', password: 'NewStr0ng!Pass' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('caretaker');
    expect(login.body.data.user.accountStatus).toBe('active');
  });
});

describe('Caretaker names', () => {
  const invite = (firstName, lastName, email, phone) => request(app)
    .post('/api/landlord/caretakers')
    .set('Authorization', `Bearer ${landlordToken}`)
    .send({ firstName, lastName, email, phone, serviceBarangay: 'Poblacion Oeste' });

  test('apostrophes are allowed (straight or curly) and the name is saved in name case', async () => {
    const res = await invite("o'connor", 'D’angelo', 'caretaker.apostrophe@gmail.com', '09302845660');
    expect(res.status).toBe(201);
    const saved = await UserRepository.findByEmail('caretaker.apostrophe@gmail.com');
    expect(saved.firstName).toBe("O'Connor");
    expect(saved.lastName).toBe("D'Angelo");
    expect(saved.fullName).toBe("O'Connor D'Angelo");
  });

  test('digits and other symbols are still refused', async () => {
    const res = await invite('Pedro2', 'Reyes-Cruz', 'caretaker.symbols@gmail.com', '09302845661');
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field).sort()).toEqual(['firstName', 'lastName']);
  });
});
