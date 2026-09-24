const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
const env = require('../../config/env');
const { VERIFICATION_STATUS } = require('../../utils/constants');

let app;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

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

async function verifiedLandlordToken(email, i) {
  await registerAndVerify({
    firstName: 'Media', lastName: 'Landlord', email, phone: `0917123${5100 + i}`, password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: 'Str0ng!Pass' });
  // eslint-disable-next-line global-require
  const UserRepository = require('../../repositories/UserRepository');
  await UserRepository.updateById(login.body.data.user._id, { businessVerificationStatus: VERIFICATION_STATUS.VERIFIED });
  return login.body.data.accessToken;
}

function baseFields(req) {
  return req
    .field('propertyName', 'Media Test House')
    .field('address[street]', '1 Media St')
    .field('address[barangay]', 'Poblacion Oeste')
    .field('locationCoordinates[lat]', '16.0436')
    .field('locationCoordinates[lng]', '120.3293')
    .field('propertyType', 'Bedspace')
    .field('tenantGenderPolicy', 'Co-Ed');
}

describe('Property media — photos (max 5) and optional video', () => {
  test('accepts exactly 5 photos', async () => {
    const token = await verifiedLandlordToken('media.five@gmail.com', 1);
    let req = baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`));
    for (let i = 0; i < 5; i += 1) {
      req = req.attach('images', Buffer.from('fake-png-bytes'), { filename: `photo${i}.png`, contentType: 'image/png' });
    }
    const res = await req;
    expect(res.status).toBe(201);
    expect(res.body.data.property.images).toHaveLength(5);
    expect(res.body.data.property.videoUrl).toBeNull();
  });

  test('rejects a 6th photo instead of silently accepting unlimited images', async () => {
    const token = await verifiedLandlordToken('media.six@gmail.com', 2);
    let req = baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`));
    for (let i = 0; i < 6; i += 1) {
      req = req.attach('images', Buffer.from('fake-png-bytes'), { filename: `photo${i}.png`, contentType: 'image/png' });
    }
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('rejects a non-image file attached as a photo', async () => {
    const token = await verifiedLandlordToken('media.badtype@gmail.com', 3);
    const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`)).attach(
      'images',
      Buffer.from('not an image'),
      { filename: 'notes.txt', contentType: 'text/plain' }
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  test('accepts an optional video alongside photos', async () => {
    const token = await verifiedLandlordToken('media.video@gmail.com', 4);
    const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`))
      .attach('images', Buffer.from('fake-png-bytes'), { filename: 'photo0.png', contentType: 'image/png' })
      .attach('video', Buffer.from('fake-mp4-bytes'), { filename: 'tour.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(201);
    expect(res.body.data.property.videoUrl).toMatch(/^\/uploads\/properties\//);
  });

  test('rejects a non-video file attached as the video', async () => {
    const token = await verifiedLandlordToken('media.badvideo@gmail.com', 5);
    const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`)).attach(
      'video',
      Buffer.from('fake-png-bytes'),
      { filename: 'not-a-video.png', contentType: 'image/png' }
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  test('rejects a photo larger than the configured per-image size limit', async () => {
    const token = await verifiedLandlordToken('media.bigimage@gmail.com', 6);
    const original = env.maxUploadMb;
    env.maxUploadMb = 0.0001; // ~105 bytes, so a 1000-byte attachment reliably exceeds it
    try {
      const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`)).attach(
        'images',
        Buffer.alloc(1000, 'a'),
        { filename: 'big.png', contentType: 'image/png' }
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('IMAGE_TOO_LARGE');
    } finally {
      env.maxUploadMb = original;
    }
  });

  test('rejects a video larger than the configured video size limit', async () => {
    const token = await verifiedLandlordToken('media.bigvideo@gmail.com', 7);
    const original = env.maxVideoUploadMb;
    env.maxVideoUploadMb = 0.0001;
    try {
      const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`)).attach(
        'video',
        Buffer.alloc(1000, 'a'),
        { filename: 'big.mp4', contentType: 'video/mp4' }
      );
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VIDEO_TOO_LARGE');
    } finally {
      env.maxVideoUploadMb = original;
    }
  });

  test('creating a listing with no photos and no video still works (both are optional)', async () => {
    const token = await verifiedLandlordToken('media.none@gmail.com', 8);
    const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`));
    expect(res.status).toBe(201);
    expect(res.body.data.property.images).toEqual([]);
    expect(res.body.data.property.videoUrl).toBeNull();
  });
});
