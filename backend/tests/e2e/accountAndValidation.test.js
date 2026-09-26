const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

// Many /api/auth/* calls below are deliberately rejected (400s count toward the shared
// IP limiter), so raise the ceiling for this file only.
process.env.AUTH_RATE_LIMIT_MAX = '1000';

let app;
let UserRepository;
let PropertyRepository;
let RoomRepository;
let ReservationRepository;
let BillingSOARepository;
let NotificationRepository;
let AuditLogRepository;
let EmailService;
let hashPassword;

const DAY_MS = 24 * 60 * 60 * 1000;
const PASSWORD = 'Str0ng!Pass';
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
// "Today" as a Philippine calendar date, matching the backend's rule.
const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  UserRepository = require('../../repositories/UserRepository');
  PropertyRepository = require('../../repositories/PropertyRepository');
  RoomRepository = require('../../repositories/RoomRepository');
  ReservationRepository = require('../../repositories/ReservationRepository');
  BillingSOARepository = require('../../repositories/BillingSOARepository');
  NotificationRepository = require('../../repositories/NotificationRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  EmailService = require('../../services/EmailService');
  ({ hashPassword } = require('../../utils/password'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

let phoneSeq = 1000;
/** Creates a ready-to-use (verified, active) account directly, then signs in. */
async function makeUser(role, email, extra = {}) {
  const user = await UserRepository.create({
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    email,
    phone: `+63917123${String(phoneSeq++).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role,
    ...(role === 'landlord' ? { businessVerificationStatus: 'VERIFIED' } : {}),
    ...extra,
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { user, token: login.body.data?.accessToken };
}

async function makeProperty(landlordId, barangay = 'Bonuan Gueset') {
  const { findBarangayByName } = require('../../utils/dagupanBarangays');
  const b = findBarangayByName(barangay);
  const property = await PropertyRepository.create({
    landlordId,
    propertyName: `${barangay} House`,
    address: { street: '1 Main St', barangay: b.name },
    locationCoordinates: { lat: b.lat, lng: b.lng },
    propertyType: 'Bedspace',
    tenantGenderPolicy: 'Co-Ed',
    listingStatus: 'approved',
  });
  const room = await RoomRepository.create({ propertyId: property._id, roomNumber: '101', capacity: 2, monthlyBaseRent: 3000 });
  return { property, room };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Objective 1 — move-in date cannot be in the past', () => {
  test('yesterday is rejected by the API; today and later are accepted', async () => {
    const { user: landlord } = await makeUser('landlord', 'movein.landlord@gmail.com');
    const { room } = await makeProperty(landlord._id);
    const { token } = await makeUser('tenant', 'movein.tenant@gmail.com');

    const past = await request(app).post('/api/reservations').set(auth(token)).send({ roomId: room._id, moveInDate: isoDay(-1) });
    expect(past.status).toBe(400);
    expect(past.body.error.details).toEqual([{ field: 'moveInDate', message: 'Move-in date cannot be in the past.' }]);

    const today = await request(app).post('/api/reservations').set(auth(token)).send({ roomId: room._id, moveInDate: manilaToday() });
    expect(today.status).toBe(201);
  });
});

describe('Objective 3 — registration OTP is sent automatically; resend replaces it', () => {
  test('the first code arrives without pressing anything, and a resend invalidates it', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');
    const email = 'otp.flow@gmail.com';
    const reg = await request(app).post('/api/auth/register').send({
      firstName: 'Otp', lastName: 'Flow', email, phone: '09171230001', password: PASSWORD, role: 'landlord', privacyConsent: true,
    });
    expect(reg.status).toBe(201);
    expect(JSON.stringify(reg.body)).not.toMatch(/\b\d{6}\b/); // the code is never in the API response
    const codes = () => sendSpy.mock.calls.filter((c) => c[0].to === email).map((c) => c[0].text.match(/\b\d{6}\b/)[0]);
    expect(codes()).toHaveLength(1); // sent by /register itself

    // Skip the 45s resend cooldown for the test.
    await UserRepository.model.updateOne({ email }, { $set: { 'otp.expiresAt': new Date(Date.now() + 60 * 1000) } });
    const resend = await request(app).post('/api/auth/resend-otp').send({ email });
    expect(resend.status).toBe(200);
    const [firstCode, secondCode] = codes();
    expect(secondCode).toBeDefined();
    sendSpy.mockRestore();

    if (firstCode !== secondCode) {
      const stale = await request(app).post('/api/auth/verify-otp').send({ email, code: firstCode, purpose: 'email_verification' });
      expect(stale.status).toBe(400);
    }
    const fresh = await request(app).post('/api/auth/verify-otp').send({ email, code: secondCode, purpose: 'email_verification' });
    expect(fresh.status).toBe(200);
  });
});

describe('Objective 6 — apostrophes in names', () => {
  test.each([
    ["o'connor", "O'Connor"],
    ["D'Angelo", "D'Angelo"],
    ["Mary Anne O'Neil", "Mary Anne O'Neil"],
    ['Maria', 'Maria'],
  ])('%s is accepted (stored as %s)', async (input, stored) => {
    const email = `name.${Math.random().toString(36).slice(2, 8)}@gmail.com`;
    const res = await request(app).post('/api/auth/register').send({
      firstName: input, lastName: 'Santos', email, phone: '09171230002', password: PASSWORD, role: 'landlord', privacyConsent: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.firstName).toBe(stored);
  });

  test.each(['J@ne', 'Anne!', "'", 'X'])('%s is still rejected', async (input) => {
    const res = await request(app).post('/api/auth/register').send({
      firstName: input, lastName: 'Santos', email: 'bad.name@gmail.com', phone: '09171230003', password: PASSWORD, role: 'landlord', privacyConsent: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toContain('firstName');
  });
});

describe('Objective 7 — passwords must not contain spaces', () => {
  const spaced = 'Password 123!';

  test('registration rejects a password with a space', async () => {
    const res = await request(app).post('/api/auth/register').send({
      firstName: 'Space', lastName: 'Case', email: 'space.case@gmail.com', phone: '09171230004', password: spaced, role: 'landlord', privacyConsent: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field: 'password', message: 'Password must not contain spaces.' });
  });

  test('password reset, password change, caretaker activation and account recovery reject it too', async () => {
    const { token } = await makeUser('tenant', 'space.flows@gmail.com');
    const cases = [
      request(app).post('/api/auth/reset-password').send({ email: 'space.flows@gmail.com', code: '123456', newPassword: spaced }),
      request(app).patch('/api/auth/change-password').set(auth(token)).send({ currentPassword: PASSWORD, newPassword: spaced }),
      request(app).post('/api/auth/activate-caretaker').send({ token: 'x', password: spaced }),
      request(app).post('/api/auth/account-recovery').send({ email: 'space.flows@gmail.com', newPassword: spaced }),
    ];
    for (const res of await Promise.all(cases)) {
      expect(res.status).toBe(400);
      expect(res.body.error.details.map((d) => d.message)).toContain('Password must not contain spaces.');
    }
  });

  test('the same password without the space is accepted', async () => {
    const res = await request(app).post('/api/auth/register').send({
      firstName: 'Nospace', lastName: 'Case', email: 'nospace.case@gmail.com', phone: '09171230005', password: 'Password123!', role: 'landlord', privacyConsent: true,
    });
    expect(res.status).toBe(201);
  });
});

describe('Objective 2/8/12 — admin: activity, suspension reasons, 60-day inactivity deactivation', () => {
  let adminToken;
  beforeAll(async () => {
    ({ token: adminToken } = await makeUser('admin', 'root.admin2@gmail.com'));
  });

  test('the user list carries last activity and last login for the activity column', async () => {
    await makeUser('tenant', 'activity.tenant@gmail.com');
    const res = await request(app).get('/api/admin/users').set(auth(adminToken));
    const u = res.body.data.users.find((x) => x.email === 'activity.tenant@gmail.com');
    expect(new Date(u.lastActivityAt).getTime()).toBeGreaterThan(Date.now() - 60 * 1000);
    expect(u.lastLoginAt).toBeTruthy();
  });

  test('suspension needs a reason, stores it, and blocks login; reactivation clears it', async () => {
    const { user } = await makeUser('tenant', 'suspend.me@gmail.com');
    const noReason = await request(app).patch(`/api/admin/users/${user._id}/status`).set(auth(adminToken)).send({ status: 'suspended' });
    expect(noReason.status).toBe(400);
    expect((await UserRepository.findById(user._id)).accountStatus).toBe('active');

    const res = await request(app)
      .patch(`/api/admin/users/${user._id}/status`)
      .set(auth(adminToken))
      .send({ status: 'suspended', reason: 'Policy violation; Suspicious activity' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.statusReason).toBe('Policy violation; Suspicious activity');
    const login = await request(app).post('/api/auth/login').send({ email: 'suspend.me@gmail.com', password: PASSWORD });
    expect(login.body.error.code).toBe('ACCOUNT_SUSPENDED');

    const back = await request(app).patch(`/api/admin/users/${user._id}/status`).set(auth(adminToken)).send({ status: 'active' });
    expect(back.body.data.user.statusReason).toBeNull();
  });

  test('inactivity deactivation is refused before 60 days and requires a reason', async () => {
    const { user } = await makeUser('tenant', 'recent.user@gmail.com');
    await UserRepository.updateById(user._id, { lastActivityAt: new Date(Date.now() - 30 * DAY_MS) });

    const early = await request(app).post(`/api/admin/users/${user._id}/deactivate-inactive`).set(auth(adminToken)).send({ reason: 'No activity' });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('NOT_INACTIVE_LONG_ENOUGH');

    await UserRepository.updateById(user._id, { lastActivityAt: new Date(Date.now() - 61 * DAY_MS) });
    const noReason = await request(app).post(`/api/admin/users/${user._id}/deactivate-inactive`).set(auth(adminToken)).send({});
    expect(noReason.status).toBe(400);
    expect((await UserRepository.findById(user._id)).accountStatus).toBe('active');
  });

  test('a 60+ day inactive account (active or auto-archived) can be deactivated; login is blocked and history kept', async () => {
    const { user: landlord } = await makeUser('landlord', 'inactive.landlord@gmail.com');
    const { property, room } = await makeProperty(landlord._id, 'Lucao');
    const { user: tenant } = await makeUser('tenant', 'inactive.tenant@gmail.com');
    const reservation = await ReservationRepository.create({ tenantId: tenant._id, roomId: room._id, propertyId: property._id, status: 'completed', moveInDate: new Date() });
    const soa = await BillingSOARepository.create({
      tenantId: tenant._id, roomId: room._id, billingPeriod: new Date('2026-01-01'), baseRent: 3000, totalAmountDue: 3000, remainingBalance: 0, amountPaid: 3000, paymentStatus: 'PAID', dueDate: new Date('2026-01-11'),
    });
    // Already archived by the automatic day-30 sweep, now 75 days without activity.
    await UserRepository.updateById(tenant._id, { accountStatus: 'archived', archiveReason: 'INACTIVITY', lastActivityAt: new Date(Date.now() - 75 * DAY_MS) });

    const res = await request(app)
      .post(`/api/admin/users/${tenant._id}/deactivate-inactive`)
      .set(auth(adminToken))
      .send({ reason: 'No activity for over 60 days' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.accountStatus).toBe('deactivated');
    expect(res.body.data.user.statusReason).toMatch(/^Inactive for 75 days: No activity for over 60 days$/);

    const login = await request(app).post('/api/auth/login').send({ email: 'inactive.tenant@gmail.com', password: PASSWORD });
    expect(login.body.error.code).toBe('ACCOUNT_DEACTIVATED');
    // Deactivation is stronger than archiving: self-service recovery no longer works.
    const recovery = await request(app).post('/api/auth/account-recovery').send({ email: 'inactive.tenant@gmail.com', newPassword: 'N3w!Password' });
    expect(recovery.status).toBe(400);

    expect(await ReservationRepository.findById(reservation._id)).not.toBeNull();
    expect(await BillingSOARepository.findById(soa._id)).not.toBeNull();
    const logs = await AuditLogRepository.find({ action: 'ACCOUNT_DEACTIVATED_FOR_INACTIVITY', targetId: tenant._id });
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata.daysInactive).toBe(75);
  });

  test('admin accounts cannot be deactivated for inactivity', async () => {
    const { user: other } = await makeUser('admin', 'other.admin@gmail.com');
    await UserRepository.updateById(other._id, { lastActivityAt: new Date(Date.now() - 90 * DAY_MS) });
    const res = await request(app).post(`/api/admin/users/${other._id}/deactivate-inactive`).set(auth(adminToken)).send({ reason: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('Objective 4 — location-based caretaker suggestions and explicit assignment', () => {
  test('caretakers working in the property\'s barangay are suggested first, with the reason', async () => {
    const { user: landlord, token } = await makeUser('landlord', 'loc.landlord@gmail.com');
    const { property } = await makeProperty(landlord._id, 'Bonuan Binloc');
    const { user: near } = await makeUser('caretaker', 'near.caretaker@gmail.com', { assignedLandlordId: landlord._id, serviceBarangay: 'Bonuan Binloc', firstName: 'Zed', fullName: 'Zed Near' });
    await makeUser('caretaker', 'far.caretaker@gmail.com', { assignedLandlordId: landlord._id, serviceBarangay: 'Lucao', firstName: 'Abe', fullName: 'Abe Far' });
    await makeUser('caretaker', 'unset.caretaker@gmail.com', { assignedLandlordId: landlord._id, fullName: 'Ann Unset' });
    const { user: stranger } = await makeUser('caretaker', 'stranger.caretaker@gmail.com', { serviceBarangay: 'Bonuan Binloc' });

    const res = await request(app).get(`/api/properties/${property._id}/caretakers`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.propertyBarangay).toBe('Bonuan Binloc');
    const list = res.body.data.caretakers;
    expect(list.map((c) => c.email)).toEqual(['near.caretaker@gmail.com', 'far.caretaker@gmail.com', 'unset.caretaker@gmail.com']);
    expect(list[0]).toMatchObject({ suitable: true, matchReason: 'Works in Bonuan Binloc, the same barangay as this property' });
    expect(list[1]).toMatchObject({ suitable: false, matchReason: 'Works in Lucao, not Bonuan Binloc' });
    expect(list[2]).toMatchObject({ suitable: false, matchReason: 'No service barangay set for this caretaker yet' });

    // Suggesting does not assign: only an explicit request does.
    expect((await PropertyRepository.findById(property._id)).caretakerIds).toHaveLength(0);
    const assign = await request(app).post(`/api/properties/${property._id}/caretakers`).set(auth(token)).send({ caretakerId: near._id });
    expect(assign.status).toBe(200);
    expect((await PropertyRepository.findById(property._id)).caretakerIds.map(String)).toEqual([String(near._id)]);

    // Another landlord's caretaker can't be attached.
    const bad = await request(app).post(`/api/properties/${property._id}/caretakers`).set(auth(token)).send({ caretakerId: stranger._id });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_CARETAKER');
  });

  test('inviting a caretaker requires a valid Dagupan barangay', async () => {
    const { token } = await makeUser('landlord', 'invite.loc@gmail.com');
    const res = await request(app).post('/api/landlord/caretakers').set(auth(token)).send({
      firstName: 'Loc', lastName: 'Less', email: 'loc.less@gmail.com', phone: '09171230006', serviceBarangay: 'Binmaley',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field: 'serviceBarangay', message: 'Select a valid Dagupan City barangay from the list' });
  });
});

describe('Objective 5 — bill due-date reminders', () => {
  test('7-day and 3-day reminders go out once each, and the bill is not marked overdue early', async () => {
    const BillingReminderService = require('../../services/BillingReminderService');
    const { user: landlord } = await makeUser('landlord', 'remind.landlord@gmail.com');
    const { room } = await makeProperty(landlord._id, 'Mangin');
    const { user: tenant, token } = await makeUser('tenant', 'remind.tenant@gmail.com');

    const due = new Date('2026-09-30T00:00:00Z');
    const soa = await BillingSOARepository.create({
      tenantId: tenant._id, roomId: room._id, billingPeriod: new Date('2026-09-01T00:00:00Z'), baseRent: 3000, totalAmountDue: 3200, remainingBalance: 3200, amountPaid: 0, paymentStatus: 'UNPAID', dueDate: due,
    });
    const reminders = () => NotificationRepository.find({ userId: tenant._id, relatedId: soa._id });
    const emailSpy = jest.spyOn(EmailService, 'send');

    // Sep 20: 10 days out, nothing yet.
    await BillingReminderService.runSweep(new Date('2026-09-20T02:00:00Z'));
    expect(await reminders()).toHaveLength(0);

    // Sep 23: the 7-day reminder, identifying the bill, amount, due date and days left.
    await BillingReminderService.runSweep(new Date('2026-09-23T02:00:00Z'));
    let list = await reminders();
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('BILL_DUE_IN_7_DAYS');
    expect(list[0].message).toMatch(/September 2026 bill \(ref\. [0-9A-F]{6}\) of ₱3,200\.00 is due on September 30, 2026, 7 days from now/);
    expect(emailSpy.mock.calls.some((c) => c[0].to === 'remind.tenant@gmail.com' && /due in 7 days/.test(c[0].subject))).toBe(true);

    // Running again the same day (or twice at once) does not duplicate it.
    await Promise.all([BillingReminderService.runSweep(new Date('2026-09-23T05:00:00Z')), BillingReminderService.runForTenant(tenant._id, new Date('2026-09-23T05:00:00Z'))]);
    expect(await reminders()).toHaveLength(1);

    // Sep 27: the 3-day reminder, once.
    await BillingReminderService.runSweep(new Date('2026-09-27T02:00:00Z'));
    await BillingReminderService.runSweep(new Date('2026-09-28T02:00:00Z'));
    list = await reminders();
    expect(list.map((n) => n.type).sort()).toEqual(['BILL_DUE_IN_3_DAYS', 'BILL_DUE_IN_7_DAYS']);
    emailSpy.mockRestore();

    // Before the due date the bill is still UNPAID, not OVERDUE.
    const bill = await request(app).get(`/api/billing/soa/${soa._id}`).set(auth(token));
    expect(bill.body.data.soa.paymentStatus).toBe(Date.now() < due.getTime() ? 'UNPAID' : 'OVERDUE');
  });

  test('a bill first seen 2 days out gets only the 3-day reminder; paid bills get none', async () => {
    const BillingReminderService = require('../../services/BillingReminderService');
    const { user: landlord } = await makeUser('landlord', 'remind2.landlord@gmail.com');
    const { room } = await makeProperty(landlord._id, 'Pantal');
    const { user: tenant } = await makeUser('tenant', 'remind2.tenant@gmail.com');
    const base = { tenantId: tenant._id, roomId: room._id, baseRent: 1000, totalAmountDue: 1000, dueDate: new Date('2026-11-11T00:00:00Z') };
    const unpaid = await BillingSOARepository.create({ ...base, billingPeriod: new Date('2026-11-01T00:00:00Z'), remainingBalance: 1000, paymentStatus: 'UNPAID' });
    const paid = await BillingSOARepository.create({ ...base, billingPeriod: new Date('2026-10-01T00:00:00Z'), remainingBalance: 0, amountPaid: 1000, paymentStatus: 'PAID' });

    await BillingReminderService.runSweep(new Date('2026-11-09T02:00:00Z'));
    const sent = await NotificationRepository.find({ userId: tenant._id });
    expect(sent.map((n) => [String(n.relatedId), n.type])).toEqual([[String(unpaid._id), 'BILL_DUE_IN_3_DAYS']]);
    void paid;
  });
});

describe('Objective 11 — profile identity fields are protected', () => {
  test('name and email cannot be changed through the API; phone still can', async () => {
    const { token } = await makeUser('landlord', 'profile.lock@gmail.com');
    for (const body of [{ firstName: 'Hacked' }, { lastName: 'Hacked' }, { email: 'hacked@gmail.com' }, { fullName: 'Hacked Name' }]) {
      const res = await request(app).patch('/api/users/me').set(auth(token)).send(body);
      expect(res.status).toBe(400);
    }
    const phone = await request(app).patch('/api/users/me').set(auth(token)).send({ phone: '09181112222' });
    expect(phone.status).toBe(200);
    expect(phone.body.data.user).toMatchObject({ firstName: 'Test', email: 'profile.lock@gmail.com', phone: '+639181112222' });
  });

  test('landlords can update a caretaker\'s phone and service barangay, not their name', async () => {
    const { user: landlord, token } = await makeUser('landlord', 'ct.edit.landlord@gmail.com');
    const { user: ct } = await makeUser('caretaker', 'ct.edit@gmail.com', { assignedLandlordId: landlord._id });
    expect((await request(app).patch(`/api/landlord/caretakers/${ct._id}`).set(auth(token)).send({ firstName: 'New' })).status).toBe(400);
    const ok = await request(app).patch(`/api/landlord/caretakers/${ct._id}`).set(auth(token)).send({ serviceBarangay: 'Calmay' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.caretaker.serviceBarangay).toBe('Calmay');
  });
});

describe('Objective 13 — closing your own account is a status change, never a deletion', () => {
  test('a caretaker closes their account: login blocked, their readings and audit trail kept', async () => {
    const UtilityReadingRepository = require('../../repositories/UtilityReadingRepository');
    const { user: landlord } = await makeUser('landlord', 'close.ct.landlord@gmail.com');
    const { room } = await makeProperty(landlord._id, 'Carael');
    const { user: ct, token } = await makeUser('caretaker', 'close.caretaker@gmail.com', { assignedLandlordId: landlord._id });
    const reading = await UtilityReadingRepository.create({
      roomId: room._id, caretakerId: ct._id, readingMonth: new Date('2026-08-01'), prevElectricityKWh: 0, currElectricityKWh: 10, totalElectricBill: 100, totalWaterBill: 50,
    });

    const res = await request(app).post('/api/auth/deactivate').set(auth(token));
    expect(res.status).toBe(200);
    const stored = await UserRepository.findById(ct._id);
    expect(stored).toMatchObject({ accountStatus: 'deactivated', statusReason: 'Closed by the account owner' });
    expect(String((await UtilityReadingRepository.findById(reading._id)).caretakerId)).toBe(String(ct._id));
    expect(await AuditLogRepository.count({ action: 'ACCOUNT_CLOSED_BY_OWNER', targetId: ct._id })).toBe(1);
    const login = await request(app).post('/api/auth/login').send({ email: 'close.caretaker@gmail.com', password: PASSWORD });
    expect(login.body.error.code).toBe('ACCOUNT_DEACTIVATED');
  });

  test('a landlord with open reservations must resolve them first; after closing, listings are hidden but kept', async () => {
    const { user: landlord, token } = await makeUser('landlord', 'close.landlord@gmail.com');
    const { property, room } = await makeProperty(landlord._id, 'Herrero');
    const { user: ct } = await makeUser('caretaker', 'close.landlord.ct@gmail.com', { assignedLandlordId: landlord._id, serviceBarangay: 'Herrero' });
    await PropertyRepository.updateById(property._id, { caretakerIds: [ct._id] });
    const { user: tenant } = await makeUser('tenant', 'close.landlord.tenant@gmail.com');
    const pending = await ReservationRepository.create({ tenantId: tenant._id, roomId: room._id, propertyId: property._id, status: 'pending', moveInDate: new Date() });

    const blocked = await request(app).post('/api/auth/deactivate').set(auth(token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('LANDLORD_HAS_OPEN_RESERVATIONS');
    expect((await UserRepository.findById(landlord._id)).accountStatus).toBe('active');

    await ReservationRepository.updateById(pending._id, { status: 'rejected' });
    expect((await request(app).post('/api/auth/deactivate').set(auth(token))).status).toBe(200);

    // Hidden from tenants...
    expect((await request(app).get(`/api/properties/${property._id}`)).status).toBe(404);
    const search = await request(app).get('/api/properties').query({ barangay: 'Herrero' });
    expect(search.body.data.properties.some((p) => p._id === String(property._id))).toBe(false);
    // ...but the listing, its rooms, reservations and caretaker link are intact and still attributed to the landlord.
    const kept = await PropertyRepository.findById(property._id);
    expect(String(kept.landlordId)).toBe(String(landlord._id));
    expect(kept.caretakerIds.map(String)).toEqual([String(ct._id)]);
    expect(await RoomRepository.count({ propertyId: property._id })).toBe(1);
    expect(await ReservationRepository.count({ propertyId: property._id })).toBe(1);
    expect((await UserRepository.findById(ct._id)).assignedLandlordId.toString()).toBe(String(landlord._id));

    // An admin can still see the closed landlord and reactivate them, which brings the listing back.
    const { token: adminToken } = await makeUser('admin', 'close.admin@gmail.com');
    const users = await request(app).get('/api/admin/users').set(auth(adminToken)).query({ role: 'landlord' });
    expect(users.body.data.users.find((u) => u.email === 'close.landlord@gmail.com').accountStatus).toBe('deactivated');
    await request(app).patch(`/api/admin/users/${landlord._id}/status`).set(auth(adminToken)).send({ status: 'active' });
    expect((await request(app).get(`/api/properties/${property._id}`)).status).toBe(200);
  });

  test('admins cannot close their own account from the profile', async () => {
    const { token } = await makeUser('admin', 'self.close.admin@gmail.com');
    expect((await request(app).post('/api/auth/deactivate').set(auth(token))).status).toBe(403);
  });
});

describe('Objective 14 — server-side validation gaps closed', () => {
  test('a payment cannot exceed the remaining balance', async () => {
    const { user: landlord } = await makeUser('landlord', 'pay.landlord@gmail.com');
    const { room } = await makeProperty(landlord._id, 'Malued');
    const { user: tenant, token } = await makeUser('tenant', 'pay.tenant@gmail.com');
    const soa = await BillingSOARepository.create({
      tenantId: tenant._id, roomId: room._id, billingPeriod: new Date('2026-07-01'), baseRent: 1000, totalAmountDue: 1000, remainingBalance: 1000, paymentStatus: 'UNPAID', dueDate: new Date('2030-07-11'),
    });
    const res = await request(app)
      .post('/api/payments')
      .set(auth(token))
      .field('soaId', String(soa._id))
      .field('amount', '1500')
      .field('paymentMethod', 'GCASH_SCREENSHOT')
      .attach('proofImage', Buffer.from('png'), { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AMOUNT_EXCEEDS_BALANCE');
  });

  test('editing a property re-checks the barangay, and room fields have clear messages', async () => {
    const { user: landlord, token } = await makeUser('landlord', 'edit.prop@gmail.com');
    const { property } = await makeProperty(landlord._id, 'Calmay');
    const res = await request(app)
      .patch(`/api/properties/${property._id}`)
      .set(auth(token))
      .send({ address: { street: '2 Side St', barangay: 'Binmaley' }, locationCoordinates: { lat: 16.03, lng: 120.3 } });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({ field: 'address.barangay', message: 'Select a valid Dagupan City barangay from the list' });

    const room = await request(app).post(`/api/properties/${property._id}/rooms`).set(auth(token)).send({ roomNumber: '', capacity: 0, monthlyBaseRent: -1 });
    expect(room.status).toBe(400);
    expect(room.body.error.details.map((d) => d.message)).toEqual([
      'Room number is required (at most 20 characters)',
      'Capacity must be a whole number from 1 to 50',
      'Rent must be a number from 0 to 1,000,000',
    ]);
  });

  test('deleting a property with a pending request is refused until it is answered', async () => {
    const { user: landlord, token } = await makeUser('landlord', 'del.pending@gmail.com');
    const { property, room } = await makeProperty(landlord._id, 'Lomboy');
    const { user: tenant } = await makeUser('tenant', 'del.pending.tenant@gmail.com');
    await ReservationRepository.create({ tenantId: tenant._id, roomId: room._id, propertyId: property._id, status: 'pending', moveInDate: new Date() });
    const res = await request(app).delete(`/api/properties/${property._id}`).set(auth(token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PROPERTY_HAS_PENDING_REQUESTS');
  });
});
