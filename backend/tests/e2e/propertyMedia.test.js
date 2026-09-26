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

// Collects any response body as raw bytes, whatever its content type.
function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
const getBytes = (url, headers = {}) => request(app).get(url).set(headers).buffer(true).parse(binaryParser);

describe('Property media — stored in GridFS', () => {
  test('uploaded photos are served back publicly with their bytes and content type', async () => {
    const token = await verifiedLandlordToken('gridfs.serve@gmail.com', 9);
    const photo = Buffer.from('real-photo-bytes-123');
    const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`))
      .attach('images', photo, { filename: 'room.png', contentType: 'image/png' });
    expect(res.status).toBe(201);

    const url = res.body.data.property.images[0];
    const fetched = await getBytes(url);
    expect(fetched.status).toBe(200);
    expect(fetched.headers['content-type']).toBe('image/png');
    expect(fetched.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.compare(fetched.body, photo)).toBe(0);
  });

  test('video supports byte-range requests for seeking', async () => {
    const token = await verifiedLandlordToken('gridfs.range@gmail.com', 10);
    const video = Buffer.from('0123456789abcdefghij');
    const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`))
      .attach('video', video, { filename: 'tour.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(201);

    const partial = await getBytes(res.body.data.property.videoUrl, { Range: 'bytes=5-9' });
    expect(partial.status).toBe(206);
    expect(partial.headers['content-range']).toBe(`bytes 5-9/${video.length}`);
    expect(partial.body.toString()).toBe('56789');
  });

  test('stored filenames take their extension from the checked file type, not the client filename', async () => {
    const token = await verifiedLandlordToken('gridfs.ext@gmail.com', 13);
    const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`))
      .attach('images', Buffer.from('png-bytes'), { filename: 'evil.html', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.property.images[0]).toMatch(/^\/uploads\/properties\/\d+-[0-9a-f]{16}\.png$/);
    const fetched = await request(app).get(res.body.data.property.images[0]);
    expect(fetched.headers['content-type']).toBe('image/png');
    expect(fetched.headers['x-content-type-options']).toBe('nosniff');
  });

  test('a full database gives a clear STORAGE_FULL error and stores nothing', async () => {
    const token = await verifiedLandlordToken('gridfs.full@gmail.com', 14);
    // eslint-disable-next-line global-require
    const FileRepository = require('../../repositories/FileRepository');
    // eslint-disable-next-line global-require
    const mongoose = require('mongoose');
    const before = await mongoose.connection.db.collection('uploads.files').countDocuments();
    const spy = jest.spyOn(FileRepository, 'upload').mockRejectedValueOnce(new Error('you are over your space quota, using 513 MB of 512 MB'));
    try {
      const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`))
        .attach('images', Buffer.from('a'), { filename: 'a.png', contentType: 'image/png' });
      expect(res.status).toBe(507);
      expect(res.body.error.code).toBe('STORAGE_FULL');
    } finally {
      spy.mockRestore();
    }
    expect(await mongoose.connection.db.collection('uploads.files').countDocuments()).toBe(before);
  });

  test('an unknown file returns 404', async () => {
    const res = await request(app).get('/uploads/properties/does-not-exist.png');
    expect(res.status).toBe(404);
  });

  test('replacing photos deletes the old files; the request body cannot set photo links', async () => {
    const token = await verifiedLandlordToken('gridfs.replace@gmail.com', 11);
    const created = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`))
      .attach('images', Buffer.from('old-photo'), { filename: 'old.png', contentType: 'image/png' });
    const { _id: id, images: [oldUrl] } = created.body.data.property;

    const updated = await request(app)
      .patch(`/api/properties/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('images', Buffer.from('new-photo'), { filename: 'new.png', contentType: 'image/png' });
    expect(updated.status).toBe(200);
    const [newUrl] = updated.body.data.property.images;
    expect(newUrl).not.toBe(oldUrl);
    expect((await request(app).get(oldUrl)).status).toBe(404);
    expect((await getBytes(newUrl)).body.toString()).toBe('new-photo');

    const hijack = await request(app)
      .patch(`/api/properties/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ images: ['/uploads/properties/someone-elses.png'], videoUrl: '/uploads/properties/x.mp4' });
    expect(hijack.status).toBe(200);
    expect(hijack.body.data.property.images).toEqual([newUrl]);
    expect(hijack.body.data.property.videoUrl).toBeNull();
  });

  test('deleting a property is a soft delete: the listing disappears but its files are kept', async () => {
    const token = await verifiedLandlordToken('gridfs.delete@gmail.com', 12);
    const created = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${token}`))
      .attach('images', Buffer.from('photo'), { filename: 'p.png', contentType: 'image/png' })
      .attach('video', Buffer.from('video'), { filename: 'v.mp4', contentType: 'video/mp4' });
    const { _id: id, images: [imageUrl], videoUrl } = created.body.data.property;
    expect((await request(app).get(imageUrl)).status).toBe(200);

    const del = await request(app).delete(`/api/properties/${id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    expect((await request(app).get(`/api/properties/${id}`)).status).toBe(404);
    expect((await request(app).get(imageUrl)).status).toBe(200);
    expect((await request(app).get(videoUrl)).status).toBe(200);
  });

  test('an unverified landlord is rejected before anything is stored', async () => {
    await registerAndVerify({
      firstName: 'Unver', lastName: 'Landlord', email: 'gridfs.unverified@gmail.com', phone: '09171235199', password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
    });
    const login = await request(app).post('/api/auth/login').send({ email: 'gridfs.unverified@gmail.com', password: 'Str0ng!Pass' });
    // eslint-disable-next-line global-require
    const mongoose = require('mongoose');
    const before = await mongoose.connection.db.collection('uploads.files').countDocuments();
    const res = await baseFields(request(app).post('/api/properties').set('Authorization', `Bearer ${login.body.data.accessToken}`))
      .attach('images', Buffer.from('photo'), { filename: 'p.png', contentType: 'image/png' });
    expect(res.status).toBe(403);
    expect(await mongoose.connection.db.collection('uploads.files').countDocuments()).toBe(before);
  });
});
