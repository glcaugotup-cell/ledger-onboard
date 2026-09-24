const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
const EmailService = require('../../services/EmailService');
const UserRepository = require('../../repositories/UserRepository');
const { VERIFICATION_STATUS } = require('../../utils/constants');

let app;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app'); // required after DB connects so models attach to the live connection
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

describe('Ledger OnBoard — full vertical-slice smoke test', () => {
  let tenantToken, landlordToken, caretakerToken;
  let propertyId, roomId, reservationId, soaId, paymentId;
  let tenantId, caretakerId;

  test('landlord registers, verifies email, and logs in', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');

    const reg = await request(app).post('/api/auth/register').send({
      firstName: 'Juan', lastName: 'Landlord',
      email: 'juan.landlord@gmail.com',
      phone: '09171234567',
      password: 'Str0ng!Pass',
      role: 'landlord',
      privacyConsent: true,
    });
    expect(reg.status).toBe(201);
    expect(reg.body.success).toBe(true);
    expect(reg.body.data.user.passwordHash).toBeUndefined();

    // Unverified account cannot log in yet — enforced server-side.
    const blockedLogin = await request(app).post('/api/auth/login').send({ email: 'juan.landlord@gmail.com', password: 'Str0ng!Pass' });
    expect(blockedLogin.status).toBe(403);
    expect(blockedLogin.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(blockedLogin.body.error.message).toBe('Please verify your email address before logging in.');

    const code = sendSpy.mock.calls.find((c) => c[0].to === 'juan.landlord@gmail.com')[0].text.match(/\d{6}/)[0];
    const verify = await request(app).post('/api/auth/verify-otp').send({ email: 'juan.landlord@gmail.com', code, purpose: 'email_verification' });
    expect(verify.status).toBe(200);
    sendSpy.mockRestore();

    const login = await request(app).post('/api/auth/login').send({ email: 'juan.landlord@gmail.com', password: 'Str0ng!Pass' });
    expect(login.status).toBe(200);
    landlordToken = login.body.data.accessToken;
    expect(landlordToken).toBeTruthy();

    // Business verification is a separate gate (tested end-to-end in
    // landlordVerification.test.js) — approve it directly here so this
    // file's own property-creation test below keeps working.
    await UserRepository.updateById(login.body.data.user._id, { businessVerificationStatus: VERIFICATION_STATUS.VERIFIED });
  });

  test('tenant registers, verifies email, and logs in', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');

    const reg = await request(app).post('/api/auth/register').send({
      firstName: 'Maria', lastName: 'Tenant',
      email: 'maria.tenant@gmail.com',
      phone: '09181234567',
      password: 'Str0ng!Pass',
      role: 'tenant',
      privacyConsent: true,
      emergencyContact: { name: 'Pedro Tenant', phone: '09181234599' },
    });
    expect(reg.status).toBe(201);
    tenantId = reg.body.data.user._id;

    const code = sendSpy.mock.calls.find((c) => c[0].to === 'maria.tenant@gmail.com')[0].text.match(/\d{6}/)[0];
    const verify = await request(app).post('/api/auth/verify-otp').send({ email: 'maria.tenant@gmail.com', code, purpose: 'email_verification' });
    expect(verify.status).toBe(200);
    sendSpy.mockRestore();

    const login = await request(app).post('/api/auth/login').send({ email: 'maria.tenant@gmail.com', password: 'Str0ng!Pass' });
    tenantToken = login.body.data.accessToken;
    expect(tenantToken).toBeTruthy();
  });

  test('rejects invalid registration payload with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ firstName: 'x', lastName: 'x', email: 'not-gmail@yahoo.com', password: 'weak', role: 'tenant' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects invalid login with 401', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'maria.tenant@gmail.com', password: 'WrongPass1!' });
    expect(res.status).toBe(401);
  });

  test('landlord creates a property — a verified landlord needs no separate admin approval, so it goes straight to approved', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .field('propertyName', 'Sunshine Boarding House')
      .field('address[street]', '123 Rizal St')
      .field('address[barangay]', 'Poblacion Oeste')
      .field('locationCoordinates[lat]', '16.0433')
      .field('locationCoordinates[lng]', '120.3333')
      .field('propertyType', 'Bedspace')
      .field('tenantGenderPolicy', 'Co-Ed');
    expect(res.status).toBe(201);
    expect(res.body.data.property.listingStatus).toBe('approved');
    propertyId = res.body.data.property._id;

    // Immediately visible/searchable — no admin step stands between
    // creation and tenant visibility.
    const publicDetail = await request(app).get(`/api/properties/${propertyId}`);
    expect(publicDetail.status).toBe(200);
    const search = await request(app).get('/api/properties').query({ text: 'Sunshine Boarding House' });
    expect(search.body.data.properties.some((p) => p._id === propertyId)).toBe(true);
  });

  test('tenant cannot delete property (403)', async () => {
    const res = await request(app).delete(`/api/properties/${propertyId}`).set('Authorization', `Bearer ${tenantToken}`);
    expect(res.status).toBe(403);
  });

  test('rejects a property submitted with a barangay that is not a real Dagupan City barangay', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .field('propertyName', 'Fake Barangay House')
      .field('address[street]', '123 Rizal St')
      .field('address[barangay]', 'Not A Real Barangay')
      .field('locationCoordinates[lat]', '16.0433')
      .field('locationCoordinates[lng]', '120.3333')
      .field('propertyType', 'Bedspace')
      .field('tenantGenderPolicy', 'Co-Ed');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects a property whose coordinates do not correspond to the selected barangay (bypass attempt)', async () => {
    const res = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .field('propertyName', 'Mismatched Coordinates House')
      .field('address[street]', '123 Rizal St')
      // A real barangay, but with another city's coordinates attached —
      // the cross-field check must catch this even though each value is
      // individually well-formed.
      .field('address[barangay]', 'Poblacion Oeste')
      .field('locationCoordinates[lat]', '14.5995')
      .field('locationCoordinates[lng]', '120.9842')
      .field('propertyType', 'Bedspace')
      .field('tenantGenderPolicy', 'Co-Ed');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('admin registration is blocked from public endpoint', async () => {
    const res = await request(app).post('/api/auth/register').send({
      firstName: 'Root', lastName: 'Admin', email: 'root.admin@gmail.com', phone: '09991234567', password: 'Str0ng!Pass', role: 'admin',
    });
    expect(res.status).toBe(400); // rejected by validator enum before it ever reaches the service
  });

  let adminToken;
  test('seed an admin directly — the admin has nothing to approve on the property, since it was already approved on creation', async () => {
    // No public admin registration route by design (Section 7) — provisioned directly for this test.
    const AuthService = require('../../services/AuthService');
    const UserRepository = require('../../repositories/UserRepository');
    const { hashPassword } = require('../../utils/password');
    const passwordHash = await hashPassword('Str0ng!Pass');
    await UserRepository.create({ firstName: 'Root', lastName: 'Admin', fullName: 'Root Admin', email: 'root.admin@gmail.com', phone: '09991234567', passwordHash, role: 'admin' });

    const login = await request(app).post('/api/auth/login').send({ email: 'root.admin@gmail.com', password: 'Str0ng!Pass' });
    adminToken = login.body.data.accessToken;

    // Property listings from a verified landlord never land in the
    // moderation queue — only landlord business verification does.
    const pending = await request(app).get('/api/admin/properties/pending').set('Authorization', `Bearer ${adminToken}`);
    expect(pending.status).toBe(200);
    expect(pending.body.data.properties).toEqual([]);
    void AuthService; // referenced above only to document where creation logic lives
  });

  test('landlord creates a room under the property', async () => {
    const res = await request(app)
      .post(`/api/properties/${propertyId}/rooms`)
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ roomNumber: '101', capacity: 2, monthlyBaseRent: 2500 });
    expect(res.status).toBe(201);
    roomId = res.body.data.room._id;
    expect(res.body.data.room.status).toBe('available');
  });

  test('public can see the approved property with its room', async () => {
    const res = await request(app).get(`/api/properties/${propertyId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rooms.length).toBe(1);
  });

  test('search results carry startingRent (cheapest room) for both the plain and rent-range query paths', async () => {
    const plain = await request(app).get('/api/properties').query({ text: 'Sunshine Boarding House' });
    expect(plain.body.data.properties.find((p) => p._id === propertyId).startingRent).toBe(2500);

    const ranged = await request(app).get('/api/properties').query({ maxRent: 3000 });
    expect(ranged.body.data.properties.find((p) => p._id === propertyId).startingRent).toBe(2500);

    const tooCheap = await request(app).get('/api/properties').query({ maxRent: 2000 });
    expect(tooCheap.body.data.properties.some((p) => p._id === propertyId)).toBe(false);
  });

  test('landlord creates a caretaker (no public self-registration exists)', async () => {
    const res = await request(app)
      .post('/api/landlord/caretakers')
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ firstName: 'Pedro', lastName: 'Caretaker', email: 'pedro.caretaker@gmail.com', phone: '09201234567' });
    expect(res.status).toBe(201);
    expect(res.body.data.caretaker.accountStatus).toBe('pending_activation');
    caretakerId = res.body.data.caretaker._id;

    // Directly set the password + activate for the test (activation email isn't intercepted here).
    const UserRepository = require('../../repositories/UserRepository');
    const { hashPassword } = require('../../utils/password');
    const passwordHash = await hashPassword('Str0ng!Pass');
    await UserRepository.updateById(caretakerId, { passwordHash, accountStatus: 'active' });

    const login = await request(app).post('/api/auth/login').send({ email: 'pedro.caretaker@gmail.com', password: 'Str0ng!Pass' });
    expect(login.status).toBe(200);
    caretakerToken = login.body.data.accessToken;
  });

  test('caretaker attempting to delete a property is forbidden (403)', async () => {
    const res = await request(app).delete(`/api/properties/${propertyId}`).set('Authorization', `Bearer ${caretakerToken}`);
    expect(res.status).toBe(403);
  });

  test('landlord assigns caretaker to the property (via reservation approval flow below)', async () => {
    // Direct DB assignment to keep the test focused; production flow assigns
    // via ReservationService.updateStatus on approval, exercised next.
    const PropertyRepository = require('../../repositories/PropertyRepository');
    await PropertyRepository.updateById(propertyId, { caretakerIds: [caretakerId] });
  });

  test('tenant submits a reservation request', async () => {
    const res = await request(app)
      .post('/api/reservations')
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ roomId, moveInDate: '2026-10-01' });
    expect(res.status).toBe(201);
    expect(res.body.data.reservation.status).toBe('pending');
    reservationId = res.body.data.reservation._id;
  });

  test('landlord approves the reservation, room becomes occupied-tracked', async () => {
    const res = await request(app)
      .patch(`/api/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ status: 'approved', caretakerAssignedId: caretakerId });
    expect(res.status).toBe(200);
    expect(res.body.data.reservation.status).toBe('approved');
    expect(res.body.data.reservation.caretakerAssignedId).toBe(caretakerId);
  });

  test('caretaker not assigned to a room cannot log its utility reading (403)', async () => {
    // Register a second caretaker with no assignment to prove the guard works.
    const UserRepository = require('../../repositories/UserRepository');
    const { hashPassword } = require('../../utils/password');
    const passwordHash = await hashPassword('Str0ng!Pass');
    const rogue = await UserRepository.create({ firstName: 'Rogue', lastName: 'Caretaker', fullName: 'Rogue Caretaker', email: 'rogue.caretaker@gmail.com', phone: '09301234567', passwordHash, role: 'caretaker', assignedLandlordId: null });
    const login = await request(app).post('/api/auth/login').send({ email: 'rogue.caretaker@gmail.com', password: 'Str0ng!Pass' });
    const res = await request(app)
      .post('/api/utilities/readings')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .send({ roomId, readingMonth: '2026-10-01', totalElectricBill: 500, totalWaterBill: 200, occupantReadings: [{ tenantId, previousReading: 0, currentReading: 40 }] });
    expect(res.status).toBe(403);
    void rogue;
  });

  test('rejects negative-usage utility reading with 400', async () => {
    const res = await request(app)
      .post('/api/utilities/readings')
      .set('Authorization', `Bearer ${caretakerToken}`)
      .send({ roomId, readingMonth: '2026-10-01', totalElectricBill: 500, totalWaterBill: 200, occupantReadings: [{ tenantId, previousReading: 50, currentReading: 10 }] });
    expect(res.status).toBe(400);
  });

  test('assigned caretaker logs a utility reading, SOA is generated', async () => {
    const res = await request(app)
      .post('/api/utilities/readings')
      .set('Authorization', `Bearer ${caretakerToken}`)
      .send({ roomId, readingMonth: '2026-10-01', totalElectricBill: 500, totalWaterBill: 200, occupantReadings: [{ tenantId, previousReading: 0, currentReading: 40 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.soas.length).toBe(1);
    soaId = res.body.data.soas[0]._id;
    expect(res.body.data.soas[0].totalAmountDue).toBe(2500 + 500 + 200); // baseRent + full electric (only occupant) + water
  });

  test('duplicate reading for the same room/month is rejected (409)', async () => {
    const res = await request(app)
      .post('/api/utilities/readings')
      .set('Authorization', `Bearer ${caretakerToken}`)
      .send({ roomId, readingMonth: '2026-10-01', totalElectricBill: 500, totalWaterBill: 200, occupantReadings: [{ tenantId, previousReading: 40, currentReading: 60 }] });
    expect(res.status).toBe(409);
  });

  test('tenant views their SOA', async () => {
    const res = await request(app).get(`/api/billing/soa/${soaId}`).set('Authorization', `Bearer ${tenantToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.soa.paymentStatus).toBe('UNPAID');
  });

  test('tenant submits a GCash payment proof', async () => {
    const res = await request(app)
      .post('/api/payments')
      .set('Authorization', `Bearer ${tenantToken}`)
      .field('soaId', soaId)
      .field('amount', '3200')
      .field('paymentMethod', 'GCASH_SCREENSHOT')
      .attach('proofImage', Buffer.from('fake-png-bytes'), { filename: 'proof.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    paymentId = res.body.data.payment._id;
    expect(res.body.data.payment.verificationStatus).toBe('PENDING');
  });

  test('caretaker cannot verify a GCash payment (only landlord/admin can)', async () => {
    const res = await request(app)
      .patch(`/api/payments/${paymentId}/verify`)
      .set('Authorization', `Bearer ${caretakerToken}`)
      .send({ approve: true });
    expect(res.status).toBe(403);
  });

  test('landlord verifies the payment, SOA flips to PAID', async () => {
    const res = await request(app)
      .patch(`/api/payments/${paymentId}/verify`)
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ approve: true });
    expect(res.status).toBe(200);
    expect(res.body.data.payment.verificationStatus).toBe('VERIFIED');

    const soaRes = await request(app).get(`/api/billing/soa/${soaId}`).set('Authorization', `Bearer ${tenantToken}`);
    expect(soaRes.body.data.soa.paymentStatus).toBe('PAID');
    expect(soaRes.body.data.soa.remainingBalance).toBe(0);
  });

  test('landlord sees analytics reflecting the verified payment', async () => {
    const res = await request(app).get('/api/analytics/landlord').set('Authorization', `Bearer ${landlordToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.verifiedPaymentsTotal).toBe(3200);
    expect(res.body.data.totalRooms).toBe(1);
  });

  test('reservation completes, freeing the room, and the tenant becomes review-eligible', async () => {
    const complete = await request(app)
      .patch(`/api/reservations/${reservationId}/status`)
      .set('Authorization', `Bearer ${landlordToken}`)
      .send({ status: 'completed' });
    expect(complete.status).toBe(200);

    const eligible = await request(app).get('/api/reviews/eligible').set('Authorization', `Bearer ${tenantToken}`);
    expect(eligible.status).toBe(200);
    expect(eligible.body.data.eligibleReservations.length).toBe(1);
  });

  test('tenant submits a review; rating outside 1-5 is rejected first', async () => {
    const bad = await request(app)
      .post(`/api/properties/${propertyId}/reviews`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ reservationId, rating: 7, comment: 'Great place' });
    expect(bad.status).toBe(400);

    const good = await request(app)
      .post(`/api/properties/${propertyId}/reviews`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ reservationId, rating: 5, comment: 'Great place' });
    expect(good.status).toBe(201);
    expect(good.body.data.review.status).toBe('PENDING');
  });

  test('duplicate review for the same completed tenancy is rejected', async () => {
    const res = await request(app)
      .post(`/api/properties/${propertyId}/reviews`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({ reservationId, rating: 4, comment: 'Again' });
    expect(res.status).toBe(409);
  });

  test('admin moderates the review to approved and it appears publicly, labeled verified former tenant', async () => {
    const pending = await request(app).get('/api/reviews/pending').set('Authorization', `Bearer ${adminToken}`);
    const reviewId = pending.body.data.reviews[0]._id;

    const modRes = await request(app).patch(`/api/reviews/${reviewId}/moderate`).set('Authorization', `Bearer ${adminToken}`).send({ status: 'APPROVED' });
    expect(modRes.status).toBe(200);

    const publicReviews = await request(app).get(`/api/properties/${propertyId}/reviews`);
    expect(publicReviews.status).toBe(200);
    expect(publicReviews.body.data.reviews.length).toBe(1);
    expect(publicReviews.body.data.reviews[0].isVerifiedFormerTenant).toBe(true);
  });

  test('missing/expired JWT is rejected with 401', async () => {
    const res = await request(app).get('/api/billing/soa');
    expect(res.status).toBe(401);
  });

  test('invalid MongoDB ObjectId in a route param returns 400', async () => {
    const res = await request(app).get('/api/properties/not-a-valid-id');
    expect(res.status).toBe(400);
  });

  test('response bodies never contain a password hash', async () => {
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${tenantToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
  });
});
