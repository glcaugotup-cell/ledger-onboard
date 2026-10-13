const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

// Every fixture signs in through /api/auth/login; keep the shared auth limiter out of the way.
process.env.AUTH_RATE_LIMIT_MAX = '1000';

let app;
let env;
let EmailService;
let UserRepository;
let AuditLogRepository;
let Property;
let Room;
let Reservation;
let BillingSOA;
let PaymentTransaction;
let LandlordVerification;
let Notification;
let hashPassword;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  env = require('../../config/env');
  EmailService = require('../../services/EmailService');
  UserRepository = require('../../repositories/UserRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  Property = require('../../models/Property');
  Room = require('../../models/Room');
  Reservation = require('../../models/Reservation');
  BillingSOA = require('../../models/BillingSOA');
  PaymentTransaction = require('../../models/PaymentTransaction');
  LandlordVerification = require('../../models/LandlordVerification');
  Notification = require('../../models/Notification');
  ({ hashPassword } = require('../../utils/password'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
  env.emailTransport = 'console';
});

const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'Str0ng!Pass';
let phoneSeq = 0;

/** A ready-to-use account (users created outside register() are already email-verified). */
async function makeUser(role, name, extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: name,
    lastName: 'Test',
    fullName: `${name} Test`,
    email: `${name.toLowerCase()}.${role}@gmail.com`,
    phone: `0917555${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role,
    accountStatus: 'active',
    // New rule: routine notifications require real inbox proof and email opt-in.
    emailConfirmedAt: new Date(), notificationPreferences: { email: true, inApp: true },
    ...(role === 'tenant' ? { emergencyContact: { name: 'Emergency Contact', phone: '09170000099' } } : {}),
    ...extra,
  });
}

async function tokenFor(user) {
  const res = await request(app).post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  return res.body.data.accessToken;
}

async function makeRoom(landlord, name) {
  const property = await Property.create({
    landlordId: landlord._id,
    propertyName: `${name} House`,
    address: { street: '1 Test St', barangay: 'Poblacion Oeste', city: 'Dagupan City', province: 'Pangasinan' },
    locationCoordinates: { lat: 16.04, lng: 120.33 },
    propertyType: 'Bedspace',
    tenantGenderPolicy: 'Co-Ed',
    listingStatus: 'approved',
  });
  const room = await Room.create({ propertyId: property._id, roomNumber: '1', capacity: 2, currentOccupancy: 0, monthlyBaseRent: 2500, status: 'available' });
  return { property, room };
}

function makeBill(tenant, room, { dueInDays = 10 } = {}) {
  return BillingSOA.create({
    tenantId: tenant._id,
    roomId: room._id,
    billingPeriod: new Date(Date.UTC(2026, 8, 1)),
    baseRent: 2500,
    totalAmountDue: 2500,
    remainingBalance: 2500,
    dueDate: new Date(Date.now() + dueInDays * DAY_MS),
  });
}

const failingEmail = () => jest.spyOn(EmailService, 'send').mockRejectedValue(new Error('Brevo rejected the email (HTTP 401): account suspended'));

describe('Payment results: email is best-effort', () => {
  test('a failed payment-verified email still completes the payment, audit entry and in-app notification', async () => {
    const landlord = await makeUser('landlord', 'Paula');
    const tenant = await makeUser('tenant', 'Pedro');
    const { room } = await makeRoom(landlord, 'Paula');
    const soa = await makeBill(tenant, room);
    const payment = await PaymentTransaction.create({ soaId: soa._id, tenantId: tenant._id, paymentMethod: 'GCASH_QR', amount: 2500, referenceNumber: '1234567890' });
    const token = await tokenFor(landlord);

    const sendSpy = failingEmail();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).patch(`/api/payments/${payment._id}/verify`).set('Authorization', `Bearer ${token}`).send({ decision: 'COMPLETE' });

    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].subject).toContain('Payment verified');
    expect((await PaymentTransaction.findById(payment._id)).verificationStatus).toBe('VERIFIED');
    expect((await BillingSOA.findById(soa._id)).paymentStatus).toBe('PAID');
    const audit = await AuditLogRepository.findRecent({ action: 'PAYMENT_VERIFIED' });
    expect(audit.some((l) => String(l.targetId) === String(payment._id))).toBe(true);
    expect(await Notification.exists({ userId: tenant._id, type: 'PAYMENT_VERIFIED' })).toBeTruthy();
    expect(errorSpy).toHaveBeenCalledWith('[PaymentService] payment result email failed:', expect.any(String));
  }, 30000);

  test('a failing email does not fail a rejected payment either', async () => {
    const landlord = await makeUser('landlord', 'Rita');
    const tenant = await makeUser('tenant', 'Ramon');
    const { room } = await makeRoom(landlord, 'Rita');
    const soa = await makeBill(tenant, room);
    const payment = await PaymentTransaction.create({ soaId: soa._id, tenantId: tenant._id, paymentMethod: 'GCASH_QR', amount: 2500, referenceNumber: '1234567891' });
    const token = await tokenFor(landlord);

    failingEmail();
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .patch(`/api/payments/${payment._id}/verify`)
      .set('Authorization', `Bearer ${token}`)
      .send({ approve: false, rejectionReason: 'Reference not found' });

    expect(res.status).toBe(200);
    expect((await PaymentTransaction.findById(payment._id)).verificationStatus).toBe('REJECTED');
    const audit = await AuditLogRepository.findRecent({ action: 'PAYMENT_VERIFIED' });
    expect(audit.some((l) => String(l.targetId) === String(payment._id))).toBe(true);
    expect(await Notification.exists({ userId: tenant._id, type: 'PAYMENT_REJECTED' })).toBeTruthy();
  }, 30000);
});

describe('Business verification results: email is best-effort', () => {
  test.each([
    ['approval', true, 'VERIFIED', 'BUSINESS_VERIFICATION_APPROVED'],
    ['rejection', false, 'REJECTED', 'BUSINESS_VERIFICATION_REJECTED'],
  ])('a failing email does not fail the %s; the audit entry exists', async (label, approve, expectedStatus, notificationType) => {
    const admin = await makeUser('admin', approve ? 'Ada' : 'Abe');
    const landlord = await makeUser('landlord', approve ? 'Lara' : 'Leo', { businessVerificationStatus: 'PENDING' });
    const submission = await LandlordVerification.create({
      landlordId: landlord._id,
      mayorBusinessPermitUrl: '/uploads/landlord-verification/permit.png',
      birForm2303Url: '/uploads/landlord-verification/bir.pdf',
    });
    const token = await tokenFor(admin);

    const sendSpy = failingEmail();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app)
      .patch(`/api/admin/landlord-verifications/${submission._id}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send(approve ? { approve: true } : { approve: false, rejectionReason: 'BIR Form 2303 is illegible.' });

    expect(res.status).toBe(200);
    expect(sendSpy).toHaveBeenCalled();
    expect(res.body.data.submission.status).toBe(expectedStatus);
    expect((await UserRepository.findById(landlord._id)).businessVerificationStatus).toBe(expectedStatus);
    const audit = await AuditLogRepository.findRecent({ action: 'BUSINESS_VERIFICATION_REVIEWED' });
    expect(audit.some((l) => String(l.targetId) === String(submission._id))).toBe(true);
    expect(await Notification.exists({ userId: landlord._id, type: notificationType })).toBeTruthy();
    expect(errorSpy).toHaveBeenCalledWith('[LandlordVerificationService] verification result email failed:', expect.stringContaining('account suspended'));
  }, 30000);
});

describe('EMAIL_TRANSPORT=none across the app', () => {
  test('the inactivity sweep records skipped emails, not failures, and logs nothing', async () => {
    const AccountLifecycleService = require('../../services/AccountLifecycleService');
    const toWarn = await makeUser('tenant', 'Wendy', { lastActivityAt: new Date(Date.now() - 26 * DAY_MS) });
    const toArchive = await makeUser('tenant', 'Archie', { lastActivityAt: new Date(Date.now() - 31 * DAY_MS) });

    env.emailTransport = 'none';
    const logSpy = jest.spyOn(console, 'log');
    const errorSpy = jest.spyOn(console, 'error');

    const results = await AccountLifecycleService.runDailySweep();

    expect(results).toEqual({ warned: 1, archived: 1, failed: 0, deleted: 0 });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const warning = (await AuditLogRepository.findRecent({ action: 'ACCOUNT_ARCHIVE_WARNING_SENT' })).find((l) => String(l.targetId) === String(toWarn._id));
    expect(warning.metadata.emailStatus).toBe('skipped');
    const archived = (await AuditLogRepository.findRecent({ action: 'ACCOUNT_ARCHIVED' })).find((l) => String(l.targetId) === String(toArchive._id));
    expect(archived.metadata.emailStatus).toBe('skipped');
    expect((await UserRepository.findById(toArchive._id)).accountStatus).toBe('archived');

    const warnFailures = await AuditLogRepository.findRecent({ action: 'ACCOUNT_LIFECYCLE_WARNING_FAILED' });
    const archiveFailures = await AuditLogRepository.findRecent({ action: 'ACCOUNT_LIFECYCLE_ARCHIVE_FAILED' });
    expect(warnFailures).toHaveLength(0);
    expect(archiveFailures).toHaveLength(0);
  }, 30000);

  test('with a real transport the same entries say the email was sent', async () => {
    const AccountLifecycleService = require('../../services/AccountLifecycleService');
    const toWarn = await makeUser('tenant', 'Sally', { lastActivityAt: new Date(Date.now() - 26 * DAY_MS) });
    jest.spyOn(EmailService, 'send').mockResolvedValue({ accepted: [toWarn.email], messageId: 'test' });

    await AccountLifecycleService.runDailySweep();

    const warning = (await AuditLogRepository.findRecent({ action: 'ACCOUNT_ARCHIVE_WARNING_SENT' })).find((l) => String(l.targetId) === String(toWarn._id));
    expect(warning.metadata.emailStatus).toBe('sent');
  }, 30000);

  test('approving a reservation works and logs nothing', async () => {
    const landlord = await makeUser('landlord', 'Nora');
    const tenant = await makeUser('tenant', 'Nico');
    const { property, room } = await makeRoom(landlord, 'Nora');
    const reservation = await Reservation.create({ tenantId: tenant._id, roomId: room._id, propertyId: property._id, status: 'pending', moveInDate: new Date(Date.now() + 7 * DAY_MS) });
    const token = await tokenFor(landlord);

    env.emailTransport = 'none';
    const sendSpy = jest.spyOn(EmailService, 'send');
    const logSpy = jest.spyOn(console, 'log');
    const errorSpy = jest.spyOn(console, 'error');

    const res = await request(app).patch(`/api/reservations/${reservation._id}/status`).set('Authorization', `Bearer ${token}`).send({ status: 'approved' });

    expect(res.status).toBe(200);
    expect(res.body.data.reservation.status).toBe('approved');
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({ to: tenant.email })); // the approval email was attempted
    await expect(sendSpy.mock.results[0].value).resolves.toEqual({ skipped: true, reason: 'transport_disabled' }); // and skipped
    expect(await Notification.exists({ userId: tenant._id, type: 'RESERVATION_APPROVED' })).toBeTruthy();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  }, 30000);

  test('bill reminders still go out in-app, are marked sent once, and log nothing', async () => {
    const BillingReminderService = require('../../services/BillingReminderService');
    const landlord = await makeUser('landlord', 'Bella');
    const tenant = await makeUser('tenant', 'Benny');
    const { room } = await makeRoom(landlord, 'Bella');
    const soa = await makeBill(tenant, room, { dueInDays: 3 });

    env.emailTransport = 'none';
    const sendSpy = jest.spyOn(EmailService, 'send');
    const logSpy = jest.spyOn(console, 'log');
    const errorSpy = jest.spyOn(console, 'error');

    const results = await BillingReminderService.runForTenant(tenant._id);

    expect(results).toEqual({ sent: 1, skipped: 0 });
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(await Notification.exists({ userId: tenant._id, type: 'BILL_DUE_IN_3_DAYS' })).toBeTruthy();
    expect((await BillingSOA.findById(soa._id)).reminders.threeDaySentAt).toBeTruthy();
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    // A second run finds the reminder already claimed.
    expect(await BillingReminderService.runForTenant(tenant._id)).toEqual({ sent: 0, skipped: 1 });
  }, 30000);
});
