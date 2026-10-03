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

describe('Caretaker invitation email', () => {
  test('creates the caretaker and sends a real activation email through EmailService.send', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');

    const res = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Glad', lastName: 'Estioco', email: 'caretaker.success@gmail.com', phone: '09302845654', serviceBarangay: 'Poblacion Oeste' });

    expect(res.status).toBe(201);
    expect(res.body.data.caretaker.accountStatus).toBe('pending_activation');
    // The activation token/URL must never be echoed back in the API response.
    expect(JSON.stringify(res.body)).not.toMatch(/activate-caretaker\?token=/);

    const call = sendSpy.mock.calls.find((c) => c[0].to === 'caretaker.success@gmail.com');
    expect(call).toBeDefined();
    expect(call[0].subject).toBe('Ledger OnBoard Caretaker Invitation');
    expect(call[0].text).toMatch(/activate-caretaker\?token=/);
    expect(call[0].text).toMatch(/Owner Landlord/); // "invited by <landlord name>"
    const invitationUrl = call[0].text.match(/https:\/\/ledger-onboard\.vercel\.app\/activate-caretaker\?token=\S+/)[0];
    expect(call[0].html).toContain(`href="${invitationUrl}"`);
    expect(call[0].html).not.toContain('localhost');
    sendSpy.mockRestore();
  });

  test('rolls back the caretaker account and returns a safe error if the activation email fails to send', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send').mockRejectedValueOnce(new Error('535 Authentication failed for SMTP account'));

    const res = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Fails', lastName: 'ToSend', email: 'caretaker.failure@gmail.com', phone: '09302845655', serviceBarangay: 'Poblacion Oeste' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CARETAKER_EMAIL_DELIVERY_FAILED');
    // Never expose the raw SMTP error to the client.
    expect(res.body.error.message).not.toMatch(/535|Authentication failed/);
    sendSpy.mockRestore();

    // Rolled back — no stranded pending-activation account left behind.
    const stranded = await UserRepository.findByEmail('caretaker.failure@gmail.com');
    expect(stranded).toBeNull();

    // Trying again with the same email must work cleanly (not 409), now that email delivery succeeds again.
    const retry = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Fails', lastName: 'ToSend', email: 'caretaker.failure@gmail.com', phone: '09302845655', serviceBarangay: 'Poblacion Oeste' });
    expect(retry.status).toBe(201);
  });

  test('landlord can resend the invitation to a pending caretaker, and the new link activates the account', async () => {
    const created = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Resend', lastName: 'Invite', email: 'caretaker.resend@gmail.com', phone: '09302845657', serviceBarangay: 'Poblacion Oeste' });
    expect(created.status).toBe(201);
    const caretakerId = created.body.data.caretaker._id;

    const sendSpy = jest.spyOn(EmailService, 'send');
    const res = await request(app)
      .post(`/api/landlord/caretakers/${caretakerId}/resend-invitation`)
      .set('Authorization', `Bearer ${landlordToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.resent).toBe(true);
    expect(res.body.data.caretaker.invitationResentAt).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toMatch(/activate-caretaker\?token=/);

    const call = sendSpy.mock.calls.find((c) => c[0].to === 'caretaker.resend@gmail.com');
    expect(call).toBeDefined();
    expect(call[0].subject).toBe('Ledger OnBoard Caretaker Invitation');
    const token = call[0].text.match(/token=(\S+)/)[1];
    sendSpy.mockRestore();

    const activate = await request(app).post('/api/auth/activate-caretaker').send({ token: decodeURIComponent(token), password: 'NewStr0ng!Pass' });
    expect(activate.status).toBe(200);
    // The acceptance date is recorded so the landlord can see when they became a caretaker.
    const activated = await UserRepository.findByEmail('caretaker.resend@gmail.com');
    expect(activated.activatedAt).toBeInstanceOf(Date);

    // Once activated, there is nothing left to resend.
    const again = await request(app)
      .post(`/api/landlord/caretakers/${caretakerId}/resend-invitation`)
      .set('Authorization', `Bearer ${landlordToken}`);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_ACTIVATED');
  });

  test('a failed resend keeps the pending caretaker account and returns a safe error', async () => {
    const created = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Resend', lastName: 'Fails', email: 'caretaker.resendfail@gmail.com', phone: '09302845658', serviceBarangay: 'Poblacion Oeste' });
    expect(created.status).toBe(201);

    const sendSpy = jest.spyOn(EmailService, 'send').mockRejectedValueOnce(new Error('535 Authentication failed for SMTP account'));
    const res = await request(app)
      .post(`/api/landlord/caretakers/${created.body.data.caretaker._id}/resend-invitation`)
      .set('Authorization', `Bearer ${landlordToken}`);
    sendSpy.mockRestore();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CARETAKER_EMAIL_DELIVERY_FAILED');
    expect(res.body.error.message).not.toMatch(/535|Authentication failed/);
    const kept = await UserRepository.findByEmail('caretaker.resendfail@gmail.com');
    expect(kept.accountStatus).toBe('pending_activation');
  });

  test("a landlord cannot resend another landlord's caretaker invitation", async () => {
    const created = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Other', lastName: 'Owner', email: 'caretaker.notyours@gmail.com', phone: '09302845659', serviceBarangay: 'Poblacion Oeste' });
    const caretaker = await UserRepository.findByEmail('caretaker.notyours@gmail.com');
    await UserRepository.updateById(caretaker._id, { assignedLandlordId: caretaker._id });

    const res = await request(app)
      .post(`/api/landlord/caretakers/${created.body.data.caretaker._id}/resend-invitation`)
      .set('Authorization', `Bearer ${landlordToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CARETAKER_NOT_FOUND');
  });

  test('caretaker can activate their account via the emailed link and then log in', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');
    const res = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Activate', lastName: 'Me', email: 'caretaker.activate@gmail.com', phone: '09302845656', serviceBarangay: 'Poblacion Oeste' });
    expect(res.status).toBe(201);

    const call = sendSpy.mock.calls.find((c) => c[0].to === 'caretaker.activate@gmail.com');
    const token = call[0].text.match(/token=(\S+)/)[1];
    sendSpy.mockRestore();

    const activate = await request(app).post('/api/auth/activate-caretaker').send({ token, password: 'NewStr0ng!Pass' });
    expect(activate.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: 'caretaker.activate@gmail.com', password: 'NewStr0ng!Pass' });
    expect(login.status).toBe(200);
    expect(login.body.data.user.role).toBe('caretaker');
    expect(login.body.data.user.accountStatus).toBe('active');
  });
});
