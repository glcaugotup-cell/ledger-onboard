const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
const UserRepository = require('../../repositories/UserRepository');
const PropertyRepository = require('../../repositories/PropertyRepository');
const RoomRepository = require('../../repositories/RoomRepository');
const NotificationRepository = require('../../repositories/NotificationRepository');
const AuditLogRepository = require('../../repositories/AuditLogRepository');
const PropertyReviewRepository = require('../../repositories/PropertyReviewRepository');
const { hashPassword } = require('../../utils/password');

let app;
const PASSWORD = 'Str0ng!Pass';
let seq = 0;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const dateOnly = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  jest.spyOn(console, 'log').mockImplementation(() => {});
}, 60000);

afterAll(async () => {
  jest.restoreAllMocks();
  await stopTestDb();
});

async function makeUser(role) {
  seq += 1;
  const email = `${role}.review${seq}@gmail.com`;
  const user = await UserRepository.create({
    firstName: 'Test', lastName: 'Reviewer', fullName: `Test Reviewer${seq}`, email,
    phone: `+63917${String(2000000 + seq).slice(-7)}`, passwordHash: await hashPassword(PASSWORD), role,
    ...(role === 'landlord' ? { businessVerificationStatus: 'VERIFIED', paymentQrUrl: '/uploads/payment-qr-codes/fake.png' } : {}),
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { user, token: login.body.data.accessToken };
}

/** A landlord's property where a tenant has stayed and moved out. */
async function completedStay() {
  const landlord = await makeUser('landlord');
  const tenant = await makeUser('tenant');
  const property = await PropertyRepository.create({
    landlordId: landlord.user._id, propertyName: `Review House ${seq}`, address: { street: '1 Main St', barangay: 'Lucao' },
    locationCoordinates: { lat: 16.04, lng: 120.33 }, propertyType: 'Bedspace', tenantGenderPolicy: 'Co-Ed', listingStatus: 'approved',
  });
  const room = await RoomRepository.create({ propertyId: property._id, roomNumber: `R${seq}`, capacity: 2, monthlyBaseRent: 3000 });
  const created = await request(app).post('/api/reservations').set(auth(tenant.token)).send({ roomId: room._id, moveInDate: dateOnly(3) });
  const id = created.body.data.reservation._id;
  for (const status of ['approved', 'active', 'completed']) {
    const res = await request(app).patch(`/api/reservations/${id}/status`).set(auth(landlord.token)).send({ status });
    expect(res.status).toBe(200);
  }
  return { landlord, tenant, property, room, reservationId: id };
}

const submit = (stay, body) => request(app).post(`/api/properties/${stay.property._id}/reviews`).set(auth(stay.tenant.token)).send({ reservationId: stay.reservationId, ...body });
const publicReviews = async (stay) => (await request(app).get(`/api/properties/${stay.property._id}`)).body.data.reviews;
const searchEntry = async (stay) => (await request(app).get('/api/properties')).body.data.properties.find((p) => p._id === String(stay.property._id));
const landlordNotes = (stay, type) => NotificationRepository.find({ userId: stay.landlord.user._id, type });

describe('Reviews are published at once and the landlord is notified', () => {
  test('a new review shows on the property page and in search ratings right away; the landlord gets the rating and comment', async () => {
    const stay = await completedStay();
    const res = await submit(stay, { rating: 4, comment: 'Clean rooms and a quiet street.' });
    expect(res.status).toBe(201);
    expect(res.body.data.review).toMatchObject({ status: 'APPROVED', isVerifiedFormerTenant: true, rating: 4 });

    const reviews = await publicReviews(stay);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ rating: 4, comment: 'Clean rooms and a quiet street.' });

    const entry = await searchEntry(stay);
    expect(entry).toMatchObject({ averageRating: 4, reviewCount: 1 });

    const [note] = await landlordNotes(stay, 'REVIEW_SUBMITTED');
    expect(note.message).toContain('4/5');
    expect(note.message).toContain('Clean rooms and a quiet street.');
    expect(note.link).toBe(`/landlord/properties/${stay.property._id}?review=${res.body.data.review._id}#reviews`);
  });

  test('search ratings average only published reviews and are empty for a property without any', async () => {
    const stay = await completedStay();
    expect(await searchEntry(stay)).toMatchObject({ averageRating: null, reviewCount: 0 });
    await submit(stay, { rating: 5 });
    // A second, separate completed stay at the same property.
    const tenant2 = await makeUser('tenant');
    const created = await request(app).post('/api/reservations').set(auth(tenant2.token)).send({ roomId: stay.room._id, moveInDate: dateOnly(3) });
    const id2 = created.body.data.reservation._id;
    for (const status of ['approved', 'active', 'completed']) await request(app).patch(`/api/reservations/${id2}/status`).set(auth(stay.landlord.token)).send({ status });
    await request(app).post(`/api/properties/${stay.property._id}/reviews`).set(auth(tenant2.token)).send({ reservationId: id2, rating: 2 });
    expect(await searchEntry(stay)).toMatchObject({ averageRating: 3.5, reviewCount: 2 });
  });
});

describe('The tenant can edit or delete their own review at any time', () => {
  test('editing changes the stars and comment, keeps one review, and notifies the landlord with old and new rating', async () => {
    const stay = await completedStay();
    const reviewId = (await submit(stay, { rating: 2, comment: 'Water was often off.' })).body.data.review._id;

    const badRating = await request(app).patch(`/api/reviews/${reviewId}`).set(auth(stay.tenant.token)).send({ rating: 0 });
    expect(badRating.status).toBe(400);

    const edited = await request(app).patch(`/api/reviews/${reviewId}`).set(auth(stay.tenant.token)).send({ rating: 4, comment: 'Landlord fixed the water pump after we talked.' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.review).toMatchObject({ rating: 4, comment: 'Landlord fixed the water pump after we talked.', status: 'APPROVED' });
    expect(edited.body.data.review.editedAt).toBeTruthy();

    const reviews = await publicReviews(stay);
    expect(reviews).toHaveLength(1);
    expect(reviews[0].rating).toBe(4);

    const [note] = await landlordNotes(stay, 'REVIEW_UPDATED');
    expect(note.message).toContain('was 2/5');
    expect(note.message).toContain('4/5');
  });

  test('only the author can edit or delete; landlords and other tenants are refused', async () => {
    const stay = await completedStay();
    const reviewId = (await submit(stay, { rating: 3 })).body.data.review._id;
    const other = await makeUser('tenant');
    expect((await request(app).patch(`/api/reviews/${reviewId}`).set(auth(other.token)).send({ rating: 1 })).status).toBe(403);
    expect((await request(app).delete(`/api/reviews/${reviewId}`).set(auth(other.token))).status).toBe(403);
    expect((await request(app).patch(`/api/reviews/${reviewId}`).set(auth(stay.landlord.token)).send({ rating: 1 })).status).toBe(403);
    expect((await request(app).delete(`/api/reviews/${reviewId}`).set(auth(stay.landlord.token))).status).toBe(403);
    expect((await publicReviews(stay))[0].rating).toBe(3);
  });

  test('deleting is a soft delete: hidden everywhere, kept on record, landlord notified; rating again brings the same review back', async () => {
    const stay = await completedStay();
    const reviewId = (await submit(stay, { rating: 1, comment: 'No hot water.' })).body.data.review._id;

    const del = await request(app).delete(`/api/reviews/${reviewId}`).set(auth(stay.tenant.token));
    expect(del.status).toBe(200);
    expect(await publicReviews(stay)).toHaveLength(0);
    expect(await searchEntry(stay)).toMatchObject({ averageRating: null, reviewCount: 0 });
    const kept = await PropertyReviewRepository.findById(reviewId);
    expect(kept.deletedAt).toBeTruthy();
    expect(kept.rating).toBe(1);
    expect(await landlordNotes(stay, 'REVIEW_DELETED')).toHaveLength(1);
    expect(await AuditLogRepository.findOne({ action: 'REVIEW_DELETED_BY_TENANT', targetId: reviewId })).toBeTruthy();

    // Deleted reviews leave the tenant's list, can't be edited, and don't bring the prompt back.
    const mine = await request(app).get('/api/reviews/mine').set(auth(stay.tenant.token));
    expect(mine.body.data.reviews).toHaveLength(0);
    expect((await request(app).patch(`/api/reviews/${reviewId}`).set(auth(stay.tenant.token)).send({ rating: 5 })).status).toBe(404);
    const eligible = await request(app).get('/api/reviews/eligible').set(auth(stay.tenant.token));
    expect(eligible.body.data.eligibleReservations).toHaveLength(0);

    const again = await submit(stay, { rating: 5, comment: 'Sorted out after a talk with the landlord.' });
    expect(again.status).toBe(201);
    expect(again.body.data.review._id).toBe(reviewId);
    expect(await PropertyReviewRepository.count({ reservationId: stay.reservationId })).toBe(1);
    expect((await publicReviews(stay))[0]).toMatchObject({ rating: 5, comment: 'Sorted out after a talk with the landlord.' });
    expect((await submit(stay, { rating: 4 })).status).toBe(409);
  });

  test("the tenant's own list shows their reviews with the property and room", async () => {
    const stay = await completedStay();
    await submit(stay, { rating: 4, comment: 'Good' });
    const mine = await request(app).get('/api/reviews/mine').set(auth(stay.tenant.token));
    expect(mine.status).toBe(200);
    expect(mine.body.data.reviews).toHaveLength(1);
    expect(mine.body.data.reviews[0]).toMatchObject({ rating: 4, reservationId: stay.reservationId });
    expect(mine.body.data.reviews[0].propertyId.propertyName).toBe(stay.property.propertyName);
    expect(mine.body.data.reviews[0].roomId.roomNumber).toBe(stay.room.roomNumber);
    expect((await request(app).get('/api/reviews/mine').set(auth(stay.landlord.token))).status).toBe(403);
  });
});

describe('Admin can hide a published review and restore it', () => {
  test('hide removes it from the page and search ratings and tells tenant and landlord; an edit keeps it hidden; restore shows it again', async () => {
    const stay = await completedStay();
    const admin = await makeUser('admin');
    const reviewId = (await submit(stay, { rating: 1, comment: 'Call me at 0917 000 0000' })).body.data.review._id;

    const list = await request(app).get('/api/reviews').set(auth(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.data.reviews.some((r) => r._id === reviewId && r.status === 'APPROVED')).toBe(true);
    expect((await request(app).get('/api/reviews').set(auth(stay.tenant.token))).status).toBe(403);
    expect((await request(app).patch(`/api/reviews/${reviewId}/moderate`).set(auth(stay.landlord.token)).send({ status: 'HIDDEN' })).status).toBe(403);

    const hide = await request(app).patch(`/api/reviews/${reviewId}/moderate`).set(auth(admin.token)).send({ status: 'HIDDEN', reason: 'Contains a phone number' });
    expect(hide.status).toBe(200);
    expect(await publicReviews(stay)).toHaveLength(0);
    expect(await searchEntry(stay)).toMatchObject({ reviewCount: 0 });
    const tenantNote = await NotificationRepository.findOne({ userId: stay.tenant.user._id, type: 'REVIEW_HIDDEN' });
    expect(tenantNote.message).toContain('Contains a phone number');
    expect(tenantNote.link).toBe(`/tenant/apartment?stay=${stay.reservationId}#past-stays`);
    expect(await landlordNotes(stay, 'REVIEW_HIDDEN')).toHaveLength(1);

    await request(app).patch(`/api/reviews/${reviewId}`).set(auth(stay.tenant.token)).send({ rating: 2, comment: 'Removed the number.' });
    expect(await publicReviews(stay)).toHaveLength(0);

    const restore = await request(app).patch(`/api/reviews/${reviewId}/moderate`).set(auth(admin.token)).send({ status: 'APPROVED' });
    expect(restore.status).toBe(200);
    expect((await publicReviews(stay))[0]).toMatchObject({ rating: 2, comment: 'Removed the number.' });
    expect(await NotificationRepository.findOne({ userId: stay.tenant.user._id, type: 'REVIEW_PUBLISHED' })).toBeTruthy();
  });

  test('an older review still waiting for approval stays off the page until an admin publishes it; deleted reviews leave the admin list', async () => {
    const stay = await completedStay();
    const admin = await makeUser('admin');
    const legacy = await PropertyReviewRepository.create({
      propertyId: stay.property._id, roomId: stay.room._id, tenantId: stay.tenant.user._id, reservationId: stay.reservationId, rating: 5, comment: 'From before', status: 'PENDING',
    });
    expect(await publicReviews(stay)).toHaveLength(0);
    const list = await request(app).get('/api/reviews').set(auth(admin.token));
    expect(list.body.data.reviews.find((r) => r._id === String(legacy._id)).status).toBe('PENDING');

    await request(app).patch(`/api/reviews/${legacy._id}/moderate`).set(auth(admin.token)).send({ status: 'APPROVED' });
    expect(await publicReviews(stay)).toHaveLength(1);

    await request(app).delete(`/api/reviews/${legacy._id}`).set(auth(stay.tenant.token));
    const after = await request(app).get('/api/reviews').set(auth(admin.token));
    expect(after.body.data.reviews.some((r) => r._id === String(legacy._id))).toBe(false);
    expect((await request(app).patch(`/api/reviews/${legacy._id}/moderate`).set(auth(admin.token)).send({ status: 'APPROVED' })).status).toBe(404);
  });
});
