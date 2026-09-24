const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

/** Same registerAndVerify pattern used in securityAndLifecycle.test.js — every
 * fixture in this file needs a verified, loginable account before it can do
 * anything else. */
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

async function loginAndGetToken(email, password = 'Str0ng!Pass') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return { token: res.body.data.accessToken, userId: res.body.data.user._id };
}

function attachDocs(req) {
  return req
    .attach('mayorBusinessPermit', Buffer.from('fake-permit-bytes'), { filename: 'permit.png', contentType: 'image/png' })
    .attach('birForm2303', Buffer.from('fake-bir-bytes'), { filename: 'bir.pdf', contentType: 'application/pdf' });
}

describe('Landlord business verification', () => {
  test('full lifecycle: submit -> admin sees pending -> approve -> landlord can create a property', async () => {
    await registerAndVerify({
      firstName: 'Vera', lastName: 'Landlord', email: 'vera.landlord@gmail.com', phone: '09171235001', password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
    });
    const { token: landlordToken } = await loginAndGetToken('vera.landlord@gmail.com');

    // Cannot create a property before verification — the real, unbypassable gate.
    const blockedCreate = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .field('propertyName', 'Vera House')
      .field('address[street]', '1 Test St')
      .field('address[barangay]', 'Poblacion Oeste')
      .field('locationCoordinates[lat]', '16.04')
      .field('locationCoordinates[lng]', '120.33')
      .field('propertyType', 'Bedspace')
      .field('tenantGenderPolicy', 'Co-Ed');
    expect(blockedCreate.status).toBe(403);
    expect(blockedCreate.body.error.code).toBe('BUSINESS_NOT_VERIFIED');

    const submitRes = await attachDocs(
      request(app).post('/api/landlord/verification').set('Authorization', `Bearer ${landlordToken}`)
    );
    expect(submitRes.status).toBe(201);
    const submissionId = submitRes.body.data.submission._id;

    // Own status is now PENDING.
    const mineAfterSubmit = await request(app).get('/api/landlord/verification/mine').set('Authorization', `Bearer ${landlordToken}`);
    expect(mineAfterSubmit.body.data.submission.status).toBe('PENDING');

    // Still blocked while the submission is only PENDING, not yet VERIFIED.
    const blockedWhilePending = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .field('propertyName', 'Vera House')
      .field('address[street]', '1 Test St')
      .field('address[barangay]', 'Poblacion Oeste')
      .field('locationCoordinates[lat]', '16.04')
      .field('locationCoordinates[lng]', '120.33')
      .field('propertyType', 'Bedspace')
      .field('tenantGenderPolicy', 'Co-Ed');
    expect(blockedWhilePending.status).toBe(403);
    expect(blockedWhilePending.body.error.code).toBe('BUSINESS_NOT_VERIFIED');

    // A second submission while one is still pending is rejected.
    const duplicateSubmit = await attachDocs(
      request(app).post('/api/landlord/verification').set('Authorization', `Bearer ${landlordToken}`)
    );
    expect(duplicateSubmit.status).toBe(409);
    expect(duplicateSubmit.body.error.code).toBe('VERIFICATION_ALREADY_PENDING');

    await registerAndVerify({
      firstName: 'Vera', lastName: 'Admin', email: 'vera.admin@gmail.com', phone: '09171235002', password: 'Str0ng!Pass', role: 'tenant', privacyConsent: true,
      emergencyContact: { name: 'X Y', phone: '09171235099' },
    });
    // eslint-disable-next-line global-require
    const UserRepository = require('../../repositories/UserRepository');
    const tenantForAdmin = await UserRepository.findByEmail('vera.admin@gmail.com');
    await UserRepository.updateById(tenantForAdmin._id, { role: 'admin' });
    const { token: adminToken } = await loginAndGetToken('vera.admin@gmail.com');

    const pendingRes = await request(app).get('/api/admin/landlord-verifications/pending').set('Authorization', `Bearer ${adminToken}`);
    expect(pendingRes.status).toBe(200);
    expect(pendingRes.body.data.submissions.some((s) => s._id === submissionId)).toBe(true);

    const approveRes = await request(app)
      .patch(`/api/admin/landlord-verifications/${submissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approve: true });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.data.submission.status).toBe('VERIFIED');

    // Landlord can now create a property.
    const createRes = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .field('propertyName', 'Vera House')
      .field('address[street]', '1 Test St')
      .field('address[barangay]', 'Poblacion Oeste')
      .field('locationCoordinates[lat]', '16.04')
      .field('locationCoordinates[lng]', '120.33')
      .field('propertyType', 'Bedspace')
      .field('tenantGenderPolicy', 'Co-Ed');
    expect(createRes.status).toBe(201);
    // A verified landlord needs no separate per-property admin approval —
    // the listing is immediately approved/published.
    expect(createRes.body.data.property.listingStatus).toBe('approved');

    // The property-moderation endpoint still exists and still works (an
    // admin could use it to unpublish/re-approve a listing by hand if ever
    // needed), it's just no longer a required step — approving an already-
    // approved listing here is a harmless no-op.
    const adminModerate = await request(app)
      .patch(`/api/admin/properties/${createRes.body.data.property._id}/moderate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });
    expect(adminModerate.status).toBe(200);

    // Tenant-facing badge is a plain boolean on the public listing response —
    // never the raw verification enum or a document reference.
    const publicDetail = await request(app).get(`/api/properties/${createRes.body.data.property._id}`);
    expect(publicDetail.body.data.property.landlordVerified).toBe(true);
    expect(publicDetail.body.data.property.businessVerificationStatus).toBeUndefined();
  }, 30000);

  test('rejection with a reason is visible to the landlord, who can then resubmit', async () => {
    await registerAndVerify({
      firstName: 'Rex', lastName: 'Landlord', email: 'rex.landlord@gmail.com', phone: '09171235003', password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
    });
    const { token: landlordToken } = await loginAndGetToken('rex.landlord@gmail.com');

    const submitRes = await attachDocs(
      request(app).post('/api/landlord/verification').set('Authorization', `Bearer ${landlordToken}`)
    );
    const submissionId = submitRes.body.data.submission._id;

    await registerAndVerify({
      firstName: 'Rex', lastName: 'Admin', email: 'rex.admin@gmail.com', phone: '09171235004', password: 'Str0ng!Pass', role: 'tenant', privacyConsent: true,
      emergencyContact: { name: 'X Y', phone: '09171235098' },
    });
    // eslint-disable-next-line global-require
    const UserRepository = require('../../repositories/UserRepository');
    const tenantForAdmin = await UserRepository.findByEmail('rex.admin@gmail.com');
    await UserRepository.updateById(tenantForAdmin._id, { role: 'admin' });
    const { token: adminToken } = await loginAndGetToken('rex.admin@gmail.com');

    const rejectRes = await request(app)
      .patch(`/api/admin/landlord-verifications/${submissionId}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ approve: false, rejectionReason: 'BIR Form 2303 is illegible.' });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.data.submission.status).toBe('REJECTED');

    const mineAfterReject = await request(app).get('/api/landlord/verification/mine').set('Authorization', `Bearer ${landlordToken}`);
    expect(mineAfterReject.body.data.submission.status).toBe('REJECTED');
    expect(mineAfterReject.body.data.submission.rejectionReason).toBe('BIR Form 2303 is illegible.');

    // Still blocked from creating a property while rejected.
    const blockedCreate = await request(app)
      .post('/api/properties')
      .set('Authorization', `Bearer ${landlordToken}`)
      .field('propertyName', 'Rex House')
      .field('address[street]', '2 Test St')
      .field('address[barangay]', 'Poblacion Oeste')
      .field('locationCoordinates[lat]', '16.04')
      .field('locationCoordinates[lng]', '120.33')
      .field('propertyType', 'Bedspace')
      .field('tenantGenderPolicy', 'Co-Ed');
    expect(blockedCreate.status).toBe(403);

    // Resubmission after a rejection is allowed (only PENDING blocks a new submit).
    const resubmitRes = await attachDocs(
      request(app).post('/api/landlord/verification').set('Authorization', `Bearer ${landlordToken}`)
    );
    expect(resubmitRes.status).toBe(201);
    expect(resubmitRes.body.data.submission._id).not.toBe(submissionId);

    const mineAfterResubmit = await request(app).get('/api/landlord/verification/mine').set('Authorization', `Bearer ${landlordToken}`);
    expect(mineAfterResubmit.body.data.submission.status).toBe('PENDING');
  }, 30000);

  test('document privacy: a non-owner gets 403, and the raw uploads path is not statically served', async () => {
    await registerAndVerify({
      firstName: 'Priv', lastName: 'Landlord', email: 'priv.landlord@gmail.com', phone: '09171235005', password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
    });
    const { token: ownerToken } = await loginAndGetToken('priv.landlord@gmail.com');

    const submitRes = await attachDocs(
      request(app).post('/api/landlord/verification').set('Authorization', `Bearer ${ownerToken}`)
    );
    const submissionId = submitRes.body.data.submission._id;

    // The owning landlord can fetch their own document.
    const ownerFetch = await request(app).get(`/api/landlord/verification/${submissionId}/document/permit`).set('Authorization', `Bearer ${ownerToken}`);
    expect(ownerFetch.status).toBe(200);

    // A different landlord cannot.
    await registerAndVerify({
      firstName: 'Other', lastName: 'Landlord', email: 'other.landlord@gmail.com', phone: '09171235006', password: 'Str0ng!Pass', role: 'landlord', privacyConsent: true,
    });
    const { token: otherLandlordToken } = await loginAndGetToken('other.landlord@gmail.com');
    const otherFetch = await request(app).get(`/api/landlord/verification/${submissionId}/document/permit`).set('Authorization', `Bearer ${otherLandlordToken}`);
    expect(otherFetch.status).toBe(403);
    expect(otherFetch.body.error.code).toBe('FORBIDDEN_DOCUMENT_ACCESS');

    // A tenant cannot either.
    await registerAndVerify({
      firstName: 'Priv', lastName: 'Tenant', email: 'priv.tenant@gmail.com', phone: '09171235007', password: 'Str0ng!Pass', role: 'tenant', privacyConsent: true,
      emergencyContact: { name: 'X Y', phone: '09171235097' },
    });
    const { token: tenantToken } = await loginAndGetToken('priv.tenant@gmail.com');
    const tenantFetch = await request(app).get(`/api/landlord/verification/${submissionId}/document/permit`).set('Authorization', `Bearer ${tenantToken}`);
    expect(tenantFetch.status).toBe(403);

    // No auth at all — also rejected (401 for missing token), never a raw file.
    const noAuthFetch = await request(app).get(`/api/landlord/verification/${submissionId}/document/permit`);
    expect(noAuthFetch.status).toBe(401);

    // The raw uploads path is never statically mounted for this subdirectory.
    const filename = submitRes.body.data.submission.mayorBusinessPermitUrl.split('/').pop();
    const staticFetch = await request(app).get(`/uploads/landlord-verification/${filename}`);
    expect(staticFetch.status).toBe(404);
  }, 30000);
});
