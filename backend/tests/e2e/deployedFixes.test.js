const crypto = require('crypto');
const request = require('supertest');
const { startTestDb, stopTestDb, clearCollections } = require('../helpers/testDb');
const UserRepository = require('../../repositories/UserRepository');
const PropertyRepository = require('../../repositories/PropertyRepository');
const RoomRepository = require('../../repositories/RoomRepository');
const NotificationRepository = require('../../repositories/NotificationRepository');
const PropertyService = require('../../services/PropertyService');
const LandlordVerificationService = require('../../services/LandlordVerificationService');
const FileStorageService = require('../../services/FileStorageService');
const NotificationService = require('../../services/NotificationService');
const { signAccessToken } = require('../../utils/jwt');

let app;
beforeAll(async () => { await startTestDb(); app = require('../../app'); }, 60000);
afterAll(stopTestDb);
beforeEach(clearCollections);
afterEach(() => jest.restoreAllMocks());

async function user(role, extra = {}) {
  return UserRepository.create({ firstName: 'Test', lastName: 'User', fullName: 'Test User',
    email: `fixture.${crypto.randomUUID()}@gmail.com`, passwordHash: crypto.randomBytes(48).toString('hex'),
    role, accountStatus: 'active', ...extra });
}
async function property(owner, extra = {}) {
  return PropertyRepository.create({ landlordId: owner._id, propertyName: 'Fixture House',
    address: { street: 'Fixture Street', barangay: 'Poblacion Oeste', city: 'Dagupan City', province: 'Pangasinan' },
    locationCoordinates: { lat: 16.0436, lng: 120.3293 }, propertyType: 'Bedspace', tenantGenderPolicy: 'Co-Ed',
    listingStatus: 'approved', ...extra });
}
async function room(p, number, rent) {
  return RoomRepository.create({ propertyId: p._id, roomNumber: number, capacity: 1, monthlyBaseRent: rent });
}

describe('Deployed issue fixes: search, editing and notifications', () => {
  test('a budget range must match one room, not the minimum in one room and maximum in another', async () => {
    const owner = await user('landlord');
    const outside = await property(owner, { propertyName: 'Outside Budget' });
    const inside = await property(owner, { propertyName: 'Inside Budget' });
    await room(outside, 'low', 500); await room(outside, 'high', 2500); await room(inside, 'fit', 1800);
    const matches = await PropertyRepository.search({ minRent: 1500, maxRent: 2000 });
    expect(matches.map(p => String(p._id))).toEqual([String(inside._id)]);
  });

  test('editing metadata clears empty lists but preserves media, rooms, owner and listing status', async () => {
    const owner = await user('landlord');
    const p = await property(owner, { amenities: ['WiFi'], images: ['/uploads/properties/fixture.png'] });
    const r = await room(p, '67', 1800);
    const result = await request(app).patch(`/api/properties/${p._id}`)
      .set('Authorization', `Bearer ${signAccessToken(owner)}`)
      .send({ propertyName: 'Updated House', amenities: [], landlordId: crypto.randomBytes(12).toString('hex'), listingStatus: 'inactive' });
    expect(result.status).toBe(200);
    expect(result.body.data.property).toMatchObject({ propertyName: 'Updated House', amenities: [],
      landlordId: String(owner._id), listingStatus: 'approved', images: ['/uploads/properties/fixture.png'] });
    expect(await RoomRepository.findById(r._id)).not.toBeNull();
    const stranger = await user('landlord');
    const forbidden = await request(app).patch(`/api/properties/${p._id}`)
      .set('Authorization', `Bearer ${signAccessToken(stranger)}`).send({ propertyName: 'Stolen House' });
    expect(forbidden.status).toBe(403);
    expect((await PropertyRepository.findById(p._id)).propertyName).toBe('Updated House');
  });

  test('assigning a property notifies its caretaker once and links to assigned rooms', async () => {
    const owner = await user('landlord'); const p = await property(owner);
    const caretaker = await user('caretaker', { assignedLandlordId: owner._id });
    const actor = { id: String(owner._id), role: 'landlord' };
    await PropertyService.assignCaretaker(p._id, actor, caretaker._id);
    await PropertyService.assignCaretaker(p._id, actor, caretaker._id);
    const notifications = await NotificationRepository.findByUser(caretaker._id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ type: 'PROPERTY_ASSIGNED', link: '/caretaker/rooms' });
    expect(String(notifications[0].relatedId)).toBe(String(p._id));
    await PropertyService.unassignCaretaker(p._id, actor, caretaker._id);
    const removed = await NotificationRepository.findByUser(caretaker._id);
    expect(removed.map(n => n.type)).toEqual(expect.arrayContaining(['PROPERTY_ASSIGNED', 'PROPERTY_UNASSIGNED']));
  });

  test('invalid caretaker assignment changes nothing and sends no notification', async () => {
    const owner = await user('landlord'); const stranger = await user('landlord'); const p = await property(owner);
    const caretaker = await user('caretaker', { assignedLandlordId: stranger._id });
    await expect(PropertyService.assignCaretaker(p._id, { id: String(owner._id), role: 'landlord' }, caretaker._id))
      .rejects.toMatchObject({ code: 'INVALID_CARETAKER' });
    expect(await NotificationRepository.findByUser(caretaker._id)).toHaveLength(0);
    expect((await PropertyRepository.findById(p._id)).caretakerIds).toHaveLength(0);
  });

  test('a verification submission notifies active admins, with its review queue link', async () => {
    const owner = await user('landlord'); const admin = await user('admin');
    const second = await user('admin'); const suspended = await user('admin', { accountStatus: 'suspended' });
    jest.spyOn(FileStorageService, 'saveUploads').mockResolvedValue(['/uploads/fixture-permit', '/uploads/fixture-bir']);
    const { submission } = await LandlordVerificationService.submit(owner._id, { permitFile: {}, birFile: {} });
    for (const recipient of [admin, second]) {
      const notes = await NotificationRepository.findByUser(recipient._id);
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ type: 'BUSINESS_VERIFICATION_SUBMITTED', link: '/admin/landlord-verifications' });
      expect(String(notes[0].relatedId)).toBe(String(submission._id));
    }
    expect(await NotificationRepository.findByUser(suspended._id)).toHaveLength(0);
    await expect(LandlordVerificationService.submit(owner._id, { permitFile: {}, birFile: {} }))
      .rejects.toMatchObject({ code: 'VERIFICATION_ALREADY_PENDING' });
    expect(await NotificationRepository.findByUser(admin._id)).toHaveLength(1);
  });

  test('a notification outage does not fail an already saved assignment or verification submission', async () => {
    const owner = await user('landlord'); const p = await property(owner);
    const caretaker = await user('caretaker', { assignedLandlordId: owner._id }); await user('admin');
    jest.spyOn(NotificationService, 'notify').mockRejectedValue(new Error('fixture notification outage'));
    jest.spyOn(FileStorageService, 'saveUploads').mockResolvedValue(['/uploads/fixture-permit', '/uploads/fixture-bir']);
    await expect(PropertyService.assignCaretaker(p._id, { id: String(owner._id), role: 'landlord' }, caretaker._id)).resolves.toBeDefined();
    await expect(LandlordVerificationService.submit(owner._id, { permitFile: {}, birFile: {} })).resolves.toHaveProperty('submission');
    expect((await PropertyRepository.findById(p._id)).caretakerIds.map(String)).toContain(String(caretaker._id));
    expect((await UserRepository.findById(owner._id)).businessVerificationStatus).toBe('PENDING');
  });
});
