const mongoose = require('mongoose');
const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
const EmailService = require('../../services/EmailService');
const UserRepository = require('../../repositories/UserRepository');
const PropertyRepository = require('../../repositories/PropertyRepository');
const RoomRepository = require('../../repositories/RoomRepository');
const ReservationRepository = require('../../repositories/ReservationRepository');
const BillingSOARepository = require('../../repositories/BillingSOARepository');
const NotificationRepository = require('../../repositories/NotificationRepository');
const MaintenanceIssueRepository = require('../../repositories/MaintenanceIssueRepository');
const PaymentTransactionRepository = require('../../repositories/PaymentTransactionRepository');
const { hashPassword } = require('../../utils/password');
const { ensurePaymentReferenceIndex } = require('../../utils/paymentReferenceIndex');

let app;
const PASSWORD = 'Str0ng!Pass';
let seq = 0;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const day = 24 * 60 * 60 * 1000;
const dateOnly = (offsetDays = 0) => new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);
const currentMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  // P2: the unique reference index is opt-in (never declared in the schema), so tests create it explicitly.
  await ensurePaymentReferenceIndex(mongoose.connection.db.collection('paymenttransactions'));
  jest.spyOn(console, 'log').mockImplementation(() => {});
}, 60000);

afterAll(async () => {
  jest.restoreAllMocks();
  await stopTestDb();
});

async function makeUser(role, extra = {}) {
  seq += 1;
  const email = `${role}.batch${seq}@gmail.com`;
  const user = await UserRepository.create({
    firstName: 'Test', lastName: `User${String.fromCharCode(65 + (seq % 26))}`, fullName: `Test User${seq}`, email,
    phone: `+63918${String(1000000 + seq).slice(-7)}`, passwordHash: await hashPassword(PASSWORD), role,
    ...(role === 'landlord' ? { businessVerificationStatus: 'VERIFIED', paymentQrUrl: '/uploads/payment-qr-codes/fake.png' } : {}),
    ...extra,
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { user, token: login.body.data.accessToken };
}

async function makeProperty(landlordId, { propertyType = 'Bedspace', capacity = 2, caretakerIds = [] } = {}) {
  const property = await PropertyRepository.create({
    landlordId, propertyName: `Batch House ${seq}`, address: { street: '1 Main St', barangay: 'Lucao' }, locationCoordinates: { lat: 16.04, lng: 120.33 },
    propertyType, tenantGenderPolicy: 'Co-Ed', listingStatus: 'approved', caretakerIds,
  });
  const room = await RoomRepository.create({ propertyId: property._id, roomNumber: `R${seq}`, capacity, monthlyBaseRent: 3000 });
  return { property, room };
}

/** A landlord with a caretaker and a property, plus helpers to move a tenant through the lifecycle. */
async function makeSetup(options = {}) {
  const landlord = await makeUser('landlord');
  const caretaker = await makeUser('caretaker', { assignedLandlordId: landlord.user._id, accountStatus: 'active' });
  const { property, room } = await makeProperty(landlord.user._id, { ...options, caretakerIds: [caretaker.user._id] });
  return { landlord, caretaker, property, room };
}

const setStatus = (token, id, body) => request(app).patch(`/api/reservations/${id}/status`).set(auth(token)).send(body);

async function reserve(tenantToken, roomId, moveInDate = dateOnly(3)) {
  const res = await request(app).post('/api/reservations').set(auth(tenantToken)).send({ roomId, moveInDate });
  expect(res.status).toBe(201);
  return res.body.data.reservation._id;
}

async function moveIn(setup, tenant) {
  const id = await reserve(tenant.token, setup.room._id);
  expect((await setStatus(setup.landlord.token, id, { status: 'approved' })).status).toBe(200);
  expect((await setStatus(setup.landlord.token, id, { status: 'active' })).status).toBe(200);
  return id;
}

describe('R1-R5: reservation and tenancy lifecycle', () => {
  test('approve holds a slot, confirm move-in keeps it, move-out releases it; full path to a review', async () => {
    const setup = await makeSetup({ capacity: 1 });
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id);

    const approved = await setStatus(setup.landlord.token, id, { status: 'approved' });
    expect(approved.body.data.reservation.status).toBe('approved');
    let room = await RoomRepository.findById(setup.room._id);
    expect(room.currentOccupancy).toBe(1);
    expect(room.status).toBe('occupied');

    // Nobody else can take the held slot.
    const other = await makeUser('tenant');
    const blocked = await request(app).post('/api/reservations').set(auth(other.token)).send({ roomId: setup.room._id, moveInDate: dateOnly(3) });
    expect(blocked.status).toBe(409);

    const active = await setStatus(setup.landlord.token, id, { status: 'active' });
    expect(active.body.data.reservation.status).toBe('active');
    room = await RoomRepository.findById(setup.room._id);
    expect(room.currentOccupancy).toBe(1);

    const out = await setStatus(setup.landlord.token, id, { status: 'completed' });
    expect(out.status).toBe(200);
    room = await RoomRepository.findById(setup.room._id);
    expect(room.currentOccupancy).toBe(0);
    expect(room.status).toBe('available');

    const eligible = await request(app).get('/api/reviews/eligible').set(auth(tenant.token));
    expect(eligible.body.data.eligibleReservations.map((r) => r._id)).toEqual([id]);
    const noRating = await request(app).post(`/api/properties/${setup.property._id}/reviews`).set(auth(tenant.token)).send({ reservationId: id, comment: 'Nice' });
    expect(noRating.status).toBe(400);
    const review = await request(app).post(`/api/properties/${setup.property._id}/reviews`).set(auth(tenant.token)).send({ reservationId: id, rating: 4 });
    expect(review.status).toBe(201);
    expect(review.body.data.review).toMatchObject({ status: 'PENDING', isVerifiedFormerTenant: true });
    const duplicate = await request(app).post(`/api/properties/${setup.property._id}/reviews`).set(auth(tenant.token)).send({ reservationId: id, rating: 5 });
    expect(duplicate.status).toBe(409);
    const prompt = await NotificationRepository.findOne({ userId: tenant.user._id, type: 'REVIEW_PROMPT' });
    expect(prompt.link).toBe(`/tenant/reservations?review=${id}`);
  });

  test('only whitelisted transitions are allowed (e.g. a reserved tenant cannot be marked moved out)', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id);
    expect((await setStatus(setup.landlord.token, id, { status: 'active' })).body.error.code).toBe('INVALID_STATUS_TRANSITION');
    await setStatus(setup.landlord.token, id, { status: 'approved' });
    expect((await setStatus(setup.landlord.token, id, { status: 'completed' })).body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('confirm move-in auto-cancels the tenant\'s other pending and reserved requests and notifies those landlords', async () => {
    const a = await makeSetup();
    const b = await makeSetup();
    const c = await makeSetup();
    const tenant = await makeUser('tenant');
    const reservedElsewhere = await reserve(tenant.token, b.room._id);
    await setStatus(b.landlord.token, reservedElsewhere, { status: 'approved' });
    const pendingElsewhere = await reserve(tenant.token, c.room._id);
    expect((await RoomRepository.findById(b.room._id)).currentOccupancy).toBe(1);

    await moveIn(a, tenant);

    const [rb, rc] = await Promise.all([ReservationRepository.findById(reservedElsewhere), ReservationRepository.findById(pendingElsewhere)]);
    expect(rb).toMatchObject({ status: 'cancelled', cancelledBy: 'system' });
    expect(rc).toMatchObject({ status: 'cancelled', cancelledBy: 'system' });
    expect((await RoomRepository.findById(b.room._id)).currentOccupancy).toBe(0);
    for (const landlord of [b.landlord, c.landlord]) {
      const note = await NotificationRepository.findOne({ userId: landlord.user._id, type: 'RESERVATION_AUTO_CANCELLED' });
      expect(note).not.toBeNull();
      expect(note.link).toMatch(/^\/landlord\/properties\//);
    }
    expect(await NotificationRepository.count({ userId: tenant.user._id, type: 'RESERVATION_AUTO_CANCELLED' })).toBe(2);
    // The records still exist: a status change, never a deletion.
    expect(await ReservationRepository.count({ tenantId: tenant.user._id })).toBe(3);
  });

  test('a tenant cannot have two current stays', async () => {
    const a = await makeSetup();
    const b = await makeSetup();
    const tenant = await makeUser('tenant');
    await moveIn(a, tenant);
    const second = await reserve(tenant.token, b.room._id);
    await setStatus(b.landlord.token, second, { status: 'approved' });
    const res = await setStatus(b.landlord.token, second, { status: 'active' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('TENANT_HAS_CURRENT_STAY');
  });

  test('no-show is allowed only after the move-in date plus the grace period, and releases the slot', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id, dateOnly(0));
    await setStatus(setup.landlord.token, id, { status: 'approved' });
    const early = await setStatus(setup.landlord.token, id, { status: 'no_show' });
    expect(early.status).toBe(400);
    expect(early.body.error.code).toBe('NO_SHOW_TOO_EARLY');

    // Default grace is 5 days: a move-in 6 days ago is past the hold.
    await ReservationRepository.updateById(id, { moveInDate: new Date(`${dateOnly(-6)}T00:00:00Z`) });
    const late = await setStatus(setup.landlord.token, id, { status: 'no_show' });
    expect(late.status).toBe(200);
    expect(late.body.data.reservation.status).toBe('no_show');
    expect((await RoomRepository.findById(setup.room._id)).currentOccupancy).toBe(0);
    expect(await NotificationRepository.findOne({ userId: tenant.user._id, type: 'RESERVATION_NO_SHOW' })).not.toBeNull();
  });

  test('move-in is refused until the landlord has a GCash QR', async () => {
    const setup = await makeSetup();
    await UserRepository.updateById(setup.landlord.user._id, { paymentQrUrl: null });
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id);
    await setStatus(setup.landlord.token, id, { status: 'approved' });
    const res = await setStatus(setup.landlord.token, id, { status: 'active' });
    expect(res.body.error.code).toBe('LANDLORD_QR_REQUIRED');
  });

  test('R5: bills and maintenance reports are refused before move-in; reserved slots are never billed', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id);
    await setStatus(setup.landlord.token, id, { status: 'approved', caretakerAssignedId: String(setup.caretaker.user._id) });

    const fixed = await request(app).post('/api/utilities/fixed-rate').set(auth(setup.caretaker.token)).send({ roomId: setup.room._id, readingMonth: currentMonth() });
    expect(fixed.status).toBe(400);
    expect(fixed.body.error.code).toBe('NO_OCCUPANTS');

    const issue = await request(app).post('/api/maintenance-issues').set(auth(tenant.token)).field('reservationId', id).field('category', 'Plumbing').field('urgency', 'low').field('description', 'Leaking sink');
    expect(issue.status).toBe(400);
    expect(issue.body.error.code).toBe('ACTIVE_TENANCY_REQUIRED');

    await setStatus(setup.landlord.token, id, { status: 'active' });
    const billed = await request(app).post('/api/utilities/fixed-rate').set(auth(setup.caretaker.token)).send({ roomId: setup.room._id, readingMonth: currentMonth() });
    expect(billed.status).toBe(201);
    expect(billed.body.data.soas).toHaveLength(1);
    const billNote = await NotificationRepository.findOne({ userId: tenant.user._id, type: 'BILL_CREATED' });
    expect(billNote.link).toBe(`/tenant/apartment?tab=billing&bill=${billed.body.data.soas[0]._id}`);
  });

  test('meter readings only accept tenants who moved in', async () => {
    const setup = await makeSetup({ propertyType: 'Apartment' });
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id);
    await setStatus(setup.landlord.token, id, { status: 'approved', caretakerAssignedId: String(setup.caretaker.user._id) });
    const body = { roomId: setup.room._id, readingMonth: currentMonth(), totalElectricBill: 500, totalWaterBill: 200, occupantReadings: [{ tenantId: String(tenant.user._id), previousReading: 0, currentReading: 40 }] };
    const refused = await request(app).post('/api/utilities/readings').set(auth(setup.caretaker.token)).send(body);
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('INVALID_OCCUPANT');
  });

  test('R6: a tenant can cancel pending and reserved requests (slot released) but not a current stay', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const pending = await reserve(tenant.token, setup.room._id);
    const cancelPending = await setStatus(tenant.token, pending, { status: 'cancelled' });
    expect(cancelPending.body.data.reservation).toMatchObject({ status: 'cancelled', cancelledBy: 'tenant' });
    expect(await NotificationRepository.findOne({ userId: setup.landlord.user._id, type: 'RESERVATION_CANCELLED' })).not.toBeNull();

    const reserved = await reserve(tenant.token, setup.room._id);
    await setStatus(setup.landlord.token, reserved, { status: 'approved' });
    expect((await RoomRepository.findById(setup.room._id)).currentOccupancy).toBe(1);
    expect((await setStatus(tenant.token, reserved, { status: 'cancelled' })).status).toBe(200);
    expect((await RoomRepository.findById(setup.room._id)).currentOccupancy).toBe(0);

    const stay = await moveIn(setup, tenant);
    const refused = await setStatus(tenant.token, stay, { status: 'cancelled' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('USE_LEAVE_REQUEST');
    // Tenants still can't approve or move themselves in.
    expect((await setStatus(tenant.token, stay, { status: 'completed' })).status).toBe(403);
  });
});

describe('R7/R8: approval email and contact privacy', () => {
  test('the approval email names the property, room, dates, landlord and caretaker contacts', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id, dateOnly(10));
    const sendSpy = jest.spyOn(EmailService, 'send');
    await setStatus(setup.landlord.token, id, { status: 'approved', caretakerAssignedId: String(setup.caretaker.user._id) });
    const mail = sendSpy.mock.calls.find((c) => c[0].to === tenant.user.email)[0];
    sendSpy.mockRestore();

    expect(mail.subject).toBe(`Your reservation is approved: ${setup.property.propertyName}, Room ${setup.room.roomNumber}`);
    for (const value of [setup.landlord.user.fullName, setup.landlord.user.email, setup.landlord.user.phone, setup.caretaker.user.fullName, setup.caretaker.user.phone, 'Lucao', 'Contact your landlord to arrange your move-in. Your room is held until']) {
      expect(mail.text).toContain(value);
    }
  });

  test('pending cards show the landlord name only; reserved cards add email and phone; public endpoints never expose them', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id);

    let list = await request(app).get('/api/reservations').set(auth(tenant.token));
    expect(list.body.data.reservations[0].landlordContact).toEqual({ fullName: setup.landlord.user.fullName });
    expect(list.body.data.reservations[0].caretakerContact).toBeNull();

    await setStatus(setup.landlord.token, id, { status: 'approved' });
    list = await request(app).get('/api/reservations').set(auth(tenant.token));
    expect(list.body.data.reservations[0].landlordContact).toEqual({ fullName: setup.landlord.user.fullName, email: setup.landlord.user.email, phone: setup.landlord.user.phone });
    expect(list.body.data.reservations[0].holdUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const publicDetail = await request(app).get(`/api/properties/${setup.property._id}`);
    const publicSearch = await request(app).get('/api/properties');
    for (const body of [publicDetail.body, publicSearch.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain(setup.landlord.user.email);
      expect(text).not.toContain(setup.landlord.user.phone);
    }
  });
});

describe('R12: request to leave', () => {
  test('tenant requests, landlord must confirm a balance to approve, decline needs a reason, balance stays recorded', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await moveIn(setup, tenant);
    await BillingSOARepository.create({ tenantId: tenant.user._id, roomId: setup.room._id, billingPeriod: new Date('2026-08-01'), baseRent: 3000, totalAmountDue: 3000, remainingBalance: 1200, paymentStatus: 'PARTIAL', dueDate: new Date('2030-08-11') });

    const requested = await request(app).post(`/api/reservations/${id}/leave-request`).set(auth(tenant.token)).send({ note: 'Graduating' });
    expect(requested.status).toBe(200);
    expect(requested.body.data.reservation.leaveRequest.status).toBe('pending');
    expect((await NotificationRepository.findOne({ userId: setup.landlord.user._id, type: 'LEAVE_REQUESTED' })).link).toMatch(/#tenants$/);
    expect((await request(app).post(`/api/reservations/${id}/leave-request`).set(auth(tenant.token)).send({})).status).toBe(409);

    const list = await request(app).get('/api/reservations').set(auth(setup.landlord.token));
    expect(list.body.data.reservations.find((r) => r._id === id).outstandingBalance).toBe(1200);

    const noReason = await request(app).patch(`/api/reservations/${id}/leave-request`).set(auth(setup.landlord.token)).send({ decision: 'decline' });
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');
    const needsAck = await request(app).patch(`/api/reservations/${id}/leave-request`).set(auth(setup.landlord.token)).send({ decision: 'approve' });
    expect(needsAck.status).toBe(409);
    expect(needsAck.body.error).toMatchObject({ code: 'BALANCE_ACKNOWLEDGEMENT_REQUIRED', details: { balance: 1200 } });

    const ok = await request(app).patch(`/api/reservations/${id}/leave-request`).set(auth(setup.landlord.token)).send({ decision: 'approve', acknowledgeBalance: true });
    expect(ok.body.data.reservation.leaveRequest).toMatchObject({ status: 'approved', balanceAtDecision: 1200 });
    await setStatus(setup.landlord.token, id, { status: 'completed' });
    const bill = await BillingSOARepository.findOne({ tenantId: tenant.user._id });
    expect(bill.remainingBalance).toBe(1200);
  });

  test('only a current stay can be left, and only by its tenant', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id);
    expect((await request(app).post(`/api/reservations/${id}/leave-request`).set(auth(tenant.token)).send({})).body.error.code).toBe('NOT_A_CURRENT_STAY');
    const stranger = await makeUser('tenant');
    expect((await request(app).post(`/api/reservations/${id}/leave-request`).set(auth(stranger.token)).send({})).status).toBe(404);
  });
});

describe('M1-M8: maintenance issues', () => {
  async function reportIssue(tenantToken, reservationId, photos = 0) {
    let req = request(app).post('/api/maintenance-issues').set(auth(tenantToken)).field('reservationId', reservationId).field('category', 'Plumbing').field('urgency', 'high').field('description', 'Leaking pipe under the sink');
    for (let i = 0; i < photos; i += 1) req = req.attach('photos', Buffer.from('fake-png'), { filename: `p${i}.png`, contentType: 'image/png' });
    return req;
  }

  test('M2: a sixth photo is rejected with a clear message; five are accepted', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await moveIn(setup, tenant);
    const six = await reportIssue(tenant.token, id, 6);
    expect(six.status).toBe(400);
    expect(six.body.error).toMatchObject({ code: 'TOO_MANY_PHOTOS', message: 'You can attach up to 5 photos.' });
    const five = await reportIssue(tenant.token, id, 5);
    expect(five.status).toBe(201);
    expect(five.body.data.issue.photos).toHaveLength(5);
  });

  test('M3-M5: assignment needs a target date (today or later); done needs a summary; the tenant confirms or reopens', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await moveIn(setup, tenant);
    const issueId = (await reportIssue(tenant.token, id)).body.data.issue._id;
    const assign = (body) => request(app).patch(`/api/maintenance-issues/${issueId}/assignment`).set(auth(setup.landlord.token)).send({ caretakerId: String(setup.caretaker.user._id), ...body });

    expect((await assign({})).status).toBe(400);
    expect((await assign({ targetDate: dateOnly(-1) })).status).toBe(400);
    const assigned = await assign({ targetDate: dateOnly(0), landlordUpdate: 'Plumber coming' });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.issue.status).toBe('in_progress');

    // Caretaker resolve now waits for the tenant too, with a required summary.
    expect((await request(app).patch(`/api/maintenance-issues/${issueId}/resolve`).set(auth(setup.caretaker.token)).field('resolutionNotes', '')).status).toBe(400);
    const done = await request(app).patch(`/api/maintenance-issues/${issueId}/resolve`).set(auth(setup.caretaker.token)).field('resolutionNotes', 'Replaced the pipe');
    expect(done.body.data.issue.status).toBe('awaiting_confirmation');
    expect((await NotificationRepository.findOne({ userId: tenant.user._id, type: 'MAINTENANCE_ISSUE_AWAITING_CONFIRMATION' })).link).toBe(`/tenant/apartment?tab=issues&issue=${issueId}`);

    const reopened = await request(app).patch(`/api/maintenance-issues/${issueId}/confirm`).set(auth(tenant.token)).send({ solved: false, note: 'Still dripping' });
    expect(reopened.body.data.issue.status).toBe('in_progress');
    expect(await NotificationRepository.findOne({ userId: setup.landlord.user._id, type: 'MAINTENANCE_ISSUE_REOPENED' })).not.toBeNull();
    expect(await NotificationRepository.findOne({ userId: setup.caretaker.user._id, type: 'MAINTENANCE_ISSUE_REOPENED' })).not.toBeNull();

    const complete = (workSummary) => request(app).patch(`/api/maintenance-issues/${issueId}/complete`).set(auth(setup.landlord.token)).send(workSummary === undefined ? {} : { workSummary });
    expect((await complete()).status).toBe(400);
    expect((await complete('ok')).status).toBe(400);
    expect((await complete('Tightened the fitting')).status).toBe(200);
    const confirmed = await request(app).patch(`/api/maintenance-issues/${issueId}/confirm`).set(auth(tenant.token)).send({ solved: true });
    expect(confirmed.body.data.issue.status).toBe('resolved');
    expect(confirmed.body.data.issue.statusHistory.map((h) => h.event)).toEqual(['reported', 'assigned', 'marked_done', 'reopened', 'marked_done', 'confirmed']);
    expect(confirmed.body.data.issue.statusHistory.every((h) => h.at)).toBe(true);
  });

  test('M6: a tenant can archive only resolved issues and restore them; the landlord still sees them', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await moveIn(setup, tenant);
    const issueId = (await reportIssue(tenant.token, id)).body.data.issue._id;
    expect((await request(app).patch(`/api/maintenance-issues/${issueId}/archive`).set(auth(tenant.token))).body.error.code).toBe('ISSUE_NOT_RESOLVED');

    await request(app).patch(`/api/maintenance-issues/${issueId}/complete`).set(auth(setup.landlord.token)).send({ workSummary: 'Fixed it' });
    await request(app).patch(`/api/maintenance-issues/${issueId}/confirm`).set(auth(tenant.token)).send({ solved: true });
    expect((await request(app).patch(`/api/maintenance-issues/${issueId}/archive`).set(auth(tenant.token))).status).toBe(200);

    const active = await request(app).get('/api/maintenance-issues').set(auth(tenant.token));
    const archived = await request(app).get('/api/maintenance-issues?archived=true').set(auth(tenant.token));
    expect(active.body.data.issues.map((i) => i._id)).not.toContain(issueId);
    expect(archived.body.data.issues.map((i) => i._id)).toContain(issueId);
    const landlordList = await request(app).get('/api/maintenance-issues').set(auth(setup.landlord.token));
    expect(landlordList.body.data.issues.map((i) => i._id)).toContain(issueId);

    await request(app).patch(`/api/maintenance-issues/${issueId}/restore`).set(auth(tenant.token));
    expect((await request(app).get('/api/maintenance-issues').set(auth(tenant.token))).body.data.issues.map((i) => i._id)).toContain(issueId);
  });

  test('M7: removal needs a reason the tenant sees; only the landlord can restore; nothing is deleted', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await moveIn(setup, tenant);
    const issueId = (await reportIssue(tenant.token, id)).body.data.issue._id;
    const remove = (reason) => request(app).patch(`/api/maintenance-issues/${issueId}/remove`).set(auth(setup.landlord.token)).send(reason === undefined ? {} : { reason });
    expect((await remove()).status).toBe(400);
    expect((await remove('Duplicate report')).status).toBe(200);

    const tenantView = await request(app).get('/api/maintenance-issues').set(auth(tenant.token));
    expect(tenantView.body.data.issues.find((i) => i._id === issueId).removedReason).toBe('Duplicate report');
    expect((await NotificationRepository.findOne({ userId: tenant.user._id, type: 'MAINTENANCE_ISSUE_REMOVED' })).message).toContain('Duplicate report');
    const landlordArchive = await request(app).get('/api/maintenance-issues?archived=true').set(auth(setup.landlord.token));
    expect(landlordArchive.body.data.issues.map((i) => i._id)).toContain(issueId);

    // The tenant's restore only touches their own archive flag; the removal stays.
    await request(app).patch(`/api/maintenance-issues/${issueId}/restore`).set(auth(tenant.token));
    expect((await MaintenanceIssueRepository.findById(issueId)).removedAt).not.toBeNull();

    expect((await request(app).patch(`/api/maintenance-issues/${issueId}/restore`).set(auth(setup.landlord.token))).status).toBe(200);
    expect((await MaintenanceIssueRepository.findById(issueId)).removedAt).toBeNull();
    expect(await NotificationRepository.findOne({ userId: tenant.user._id, type: 'MAINTENANCE_ISSUE_RESTORED' })).not.toBeNull();
  });

  test('M8: the caretaker archive is personal and does not change the issue for anyone else', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await moveIn(setup, tenant);
    const issueId = (await reportIssue(tenant.token, id)).body.data.issue._id;
    await request(app).patch(`/api/maintenance-issues/${issueId}/assignment`).set(auth(setup.landlord.token)).send({ caretakerId: String(setup.caretaker.user._id), targetDate: dateOnly(1) });
    expect((await request(app).patch(`/api/maintenance-issues/${issueId}/archive`).set(auth(setup.caretaker.token))).status).toBe(200);

    expect((await request(app).get('/api/maintenance-issues').set(auth(setup.caretaker.token))).body.data.issues).toHaveLength(0);
    expect((await request(app).get('/api/maintenance-issues?archived=true').set(auth(setup.caretaker.token))).body.data.issues).toHaveLength(1);
    const issue = await MaintenanceIssueRepository.findById(issueId);
    expect(issue.status).toBe('in_progress');
    expect((await request(app).get('/api/maintenance-issues').set(auth(tenant.token))).body.data.issues).toHaveLength(1);
    expect((await request(app).get('/api/maintenance-issues').set(auth(setup.landlord.token))).body.data.issues).toHaveLength(1);
  });
});

describe('P2: GCash reference numbers', () => {
  async function billFor() {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    await moveIn(setup, tenant);
    const soa = await BillingSOARepository.create({ tenantId: tenant.user._id, roomId: setup.room._id, billingPeriod: new Date('2026-08-01'), baseRent: 3000, totalAmountDue: 3000, remainingBalance: 3000, paymentStatus: 'UNPAID', dueDate: new Date('2030-08-11') });
    return { setup, tenant, soa };
  }
  const pay = (token, soaId, referenceNumber, amount = 100) => request(app).post('/api/payments').set(auth(token)).send({ soaId: String(soaId), amount, paymentMethod: 'GCASH_QR', referenceNumber });

  test('digits only, 10 to 13, stored as a string with leading zeros; spaces and dashes are ignored', async () => {
    const { tenant, soa } = await billFor();
    for (const bad of ['123456789', '12345678901234', 'ABC1234567890', '']) {
      const res = await pay(tenant.token, soa._id, bad);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain('Reference number must be 10 to 13 digits.');
    }
    const ok = await pay(tenant.token, soa._id, '0012 345-678 9');
    expect(ok.status).toBe(201);
    expect(ok.body.data.payment.referenceNumber).toBe('00123456789');
  });

  test('a used reference is rejected (even through the direct API); a rejected payment frees it for a resubmission', async () => {
    const a = await billFor();
    const b = await billFor();
    const first = await pay(a.tenant.token, a.soa._id, '1112223334445');
    expect(first.status).toBe(201);
    expect((await NotificationRepository.findOne({ userId: a.setup.landlord.user._id, type: 'PAYMENT_SUBMITTED' })).link).toBe(`/landlord/payments?payment=${first.body.data.payment._id}`);

    const dup = await pay(b.tenant.token, b.soa._id, '1112223334445');
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('This reference number has already been used.');

    // The unique index backs the service check up: a direct insert of a duplicate active reference fails.
    await expect(PaymentTransactionRepository.create({ soaId: b.soa._id, tenantId: b.tenant.user._id, paymentMethod: 'GCASH_QR', amount: 1, referenceNumber: '1112223334445', verificationStatus: 'PENDING' })).rejects.toMatchObject({ code: 11000 });

    await request(app).patch(`/api/payments/${first.body.data.payment._id}/verify`).set(auth(a.setup.landlord.token)).send({ approve: false, rejectionReason: 'Wrong amount' });
    const resubmit = await pay(a.tenant.token, a.soa._id, '1112223334445');
    expect(resubmit.status).toBe(201);
  });
});

describe('X1 notifications and M9 property archive', () => {
  test('a reservation request deep-links the landlord to the property page; approval links the tenant card', async () => {
    const setup = await makeSetup();
    const tenant = await makeUser('tenant');
    const id = await reserve(tenant.token, setup.room._id);
    expect((await NotificationRepository.findOne({ userId: setup.landlord.user._id, type: 'RESERVATION_REQUESTED' })).link).toBe(`/landlord/properties/${setup.property._id}?reservation=${id}#tenants`);
    await setStatus(setup.landlord.token, id, { status: 'approved' });
    expect((await NotificationRepository.findOne({ userId: tenant.user._id, type: 'RESERVATION_APPROVED' })).link).toBe(`/tenant/reservations?reservation=${id}`);
    await setStatus(setup.landlord.token, id, { status: 'active' });
    expect((await NotificationRepository.findOne({ userId: tenant.user._id, type: 'RESERVATION_MOVED_IN' })).link).toBe('/tenant/apartment');
    const listed = await request(app).get('/api/notifications').set(auth(tenant.token));
    expect(listed.body.data.notifications.every((n) => n.link)).toBe(true);
  });

  test('a hidden property appears in the landlord archive and can be restored', async () => {
    const setup = await makeSetup();
    expect((await request(app).delete(`/api/properties/${setup.property._id}`).set(auth(setup.landlord.token))).status).toBe(200);
    const archived = await request(app).get('/api/properties/mine/archived').set(auth(setup.landlord.token));
    expect(archived.body.data.properties.map((p) => p._id)).toEqual([String(setup.property._id)]);
    const other = await makeUser('landlord');
    expect((await request(app).patch(`/api/properties/${setup.property._id}/restore`).set(auth(other.token))).status).toBe(403);
    expect((await request(app).patch(`/api/properties/${setup.property._id}/restore`).set(auth(setup.landlord.token))).status).toBe(200);
    expect((await request(app).get(`/api/properties/${setup.property._id}`)).status).toBe(200);
  });
});
