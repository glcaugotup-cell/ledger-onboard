// User rule (2026-10-16): Ledger OnBoard is for student tenants. A student uploads the front and back
// of their school ID with the school and the years printed on it; an admin approves or rejects it on
// the Verifications page, and only students with a current approval can reserve. An ID printed
// "2024–2028" counts until May 31, 2028 (Manila time). Results are in-app only.
process.env.EMAIL_TRANSPORT = 'none';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.UPLOAD_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;
let UserRepository;
let PropertyRepository;
let RoomRepository;
let ReservationRepository;
let NotificationRepository;
let AuditLogRepository;
let StudentVerificationRepository;
let FileStorageService;
let hashPassword;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  UserRepository = require('../../repositories/UserRepository');
  PropertyRepository = require('../../repositories/PropertyRepository');
  RoomRepository = require('../../repositories/RoomRepository');
  ReservationRepository = require('../../repositories/ReservationRepository');
  NotificationRepository = require('../../repositories/NotificationRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  StudentVerificationRepository = require('../../repositories/StudentVerificationRepository');
  FileStorageService = require('../../services/FileStorageService');
  ({ hashPassword } = require('../../utils/password'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const PASSWORD = 'Str0ng!Pass';
const THIS_YEAR = new Date().getFullYear();
const FROM = THIS_YEAR - 1;
const UNTIL = THIS_YEAR + 2;
const FRONT = Buffer.from('front-of-the-id');
const BACK = Buffer.from('back-of-the-id');
let seq = 0;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const moveInDate = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function makeUser(role, extra = {}) {
  seq += 1;
  const email = `${role}.student${seq}@gmail.com`;
  const user = await UserRepository.create({
    firstName: 'Test', lastName: `Person${String.fromCharCode(65 + (seq % 26))}`, fullName: `Test Person${seq}`, email,
    phone: `+63917${String(2000000 + seq).slice(-7)}`, passwordHash: await hashPassword(PASSWORD), role,
    ...(role === 'tenant' ? { emergencyContact: { name: 'Ana Guardian', phone: '09171234598' } } : {}),
    ...(role === 'landlord' ? { businessVerificationStatus: 'VERIFIED' } : {}),
    ...extra,
  });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { user, token: login.body.data.accessToken };
}

async function makeRoom() {
  const landlord = await makeUser('landlord');
  const property = await PropertyRepository.create({
    landlordId: landlord.user._id, propertyName: `Student House ${seq}`, address: { street: '1 Main St', barangay: 'Lucao' },
    locationCoordinates: { lat: 16.04, lng: 120.33 }, propertyType: 'Bedspace', tenantGenderPolicy: 'Co-Ed', listingStatus: 'approved',
  });
  const room = await RoomRepository.create({ propertyId: property._id, roomNumber: `S${seq}`, capacity: 4, monthlyBaseRent: 2500 });
  return { landlord, property, room };
}

function submit(token, { front = FRONT, back = BACK, school = 'PHINMA University of Pangasinan', from = FROM, until = UNTIL, frontType = 'image/jpeg' } = {}) {
  let req = request(app).post('/api/student-verification').set(auth(token));
  if (school !== null) req = req.field('school', school);
  if (from !== null) req = req.field('validFromYear', String(from));
  if (until !== null) req = req.field('validUntilYear', String(until));
  if (front) req = req.attach('idFront', front, { filename: 'front.jpg', contentType: frontType });
  if (back) req = req.attach('idBack', back, { filename: 'back.jpg', contentType: 'image/jpeg' });
  return req;
}

const reserve = (token, roomId) => request(app).post('/api/reservations').set(auth(token)).send({ roomId, moveInDate: moveInDate() });
const review = (token, id, body) => request(app).patch(`/api/admin/student-verifications/${id}/review`).set(auth(token)).send(body);
const photo = (token, id, side) => request(app).get(`/api/student-verification/${id}/document/${side}`).set(auth(token)).buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});

describe('the whole flow', () => {
  test('a new student cannot reserve; after submitting and an admin approval they can, and both sides are told in-app', async () => {
    const admin = await makeUser('admin');
    const student = await makeUser('tenant');
    const { room } = await makeRoom();

    const before = await reserve(student.token, room._id);
    expect(before.status).toBe(403);
    expect(before.body.error).toMatchObject({ code: 'STUDENT_NOT_VERIFIED', message: 'Verify your student ID before reserving a room.' });

    const sent = await submit(student.token);
    expect(sent.status).toBe(201);
    const submission = sent.body.data.submission;
    expect(submission).toMatchObject({ status: 'PENDING', school: 'PHINMA University of Pangasinan', validFromYear: FROM, validUntilYear: UNTIL });
    expect((await UserRepository.findById(student.user._id)).studentVerificationStatus).toBe('PENDING');
    const adminNotice = await NotificationRepository.findOne({ userId: admin.user._id, type: 'STUDENT_VERIFICATION_SUBMITTED', relatedId: submission._id });
    expect(adminNotice).toMatchObject({ title: 'Student ID needs review', link: '/admin/landlord-verifications?tab=students' });
    expect(adminNotice.message).toBe(`${student.user.fullName} submitted a school ID for verification.`);

    const waiting = await reserve(student.token, room._id);
    expect(waiting.status).toBe(403);
    expect(waiting.body.error.message).toBe('Your student ID is still being reviewed. You can reserve once an admin approves it.');
    expect((await request(app).get('/api/student-verification/mine').set(auth(student.token))).body.data.submission.status).toBe('PENDING');

    const pending = await request(app).get('/api/admin/student-verifications/pending').set(auth(admin.token));
    const listed = pending.body.data.submissions.find((s) => s._id === submission._id);
    expect(listed.tenantId).toMatchObject({ fullName: student.user.fullName, email: student.user.email });

    const front = await photo(admin.token, submission._id, 'front');
    expect(front.status).toBe(200);
    expect(front.headers['content-type']).toMatch(/^image\/jpeg/);
    expect(Buffer.compare(front.body, FRONT)).toBe(0);

    const approved = await review(admin.token, submission._id, { approve: true });
    expect(approved.status).toBe(200);
    expect(approved.body.data.submission).toMatchObject({ status: 'VERIFIED', validUntilYear: UNTIL });
    expect(await UserRepository.findById(student.user._id)).toMatchObject({
      studentVerificationStatus: 'VERIFIED', studentSchool: 'PHINMA University of Pangasinan', studentIdValidUntilYear: UNTIL,
    });
    const studentNotice = await NotificationRepository.findOne({ userId: student.user._id, type: 'STUDENT_VERIFICATION_APPROVED' });
    expect(studentNotice).toMatchObject({ title: 'Student ID verified', link: '/tenant/verification' });
    expect(studentNotice.message).toBe(`You're verified as a student of PHINMA University of Pangasinan until May 31, ${UNTIL}. You can now reserve rooms.`);
    const audit = (await AuditLogRepository.findRecent({ action: 'STUDENT_VERIFICATION_REVIEWED' })).find((l) => String(l.targetId) === submission._id);
    expect(audit.metadata).toEqual({ approved: true, validUntilYear: UNTIL });

    expect((await reserve(student.token, room._id)).status).toBe(201);
  }, 30000);
});

describe('what a submission must have', () => {
  test('both photos, images only, a school, and years that make sense and have not ended; nothing is stored otherwise', async () => {
    const student = await makeUser('tenant');

    const noBack = await submit(student.token, { back: null });
    expect(noBack.status).toBe(400);
    expect(noBack.body.error.code).toBe('DOCUMENTS_REQUIRED');

    const pdf = await submit(student.token, { frontType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    expect(pdf.body.error.code).toBe('INVALID_FILE_TYPE');

    const noSchool = await submit(student.token, { school: ' ' });
    expect(noSchool.status).toBe(400);
    expect(JSON.stringify(noSchool.body.error)).toContain('Enter your school');

    const backwards = await submit(student.token, { from: UNTIL, until: FROM });
    expect(backwards.status).toBe(400);
    expect(JSON.stringify(backwards.body.error)).toContain("The last year can't be before the first year");

    const ended = await submit(student.token, { from: THIS_YEAR - 5, until: THIS_YEAR - 1 });
    expect(ended.status).toBe(400);
    expect(JSON.stringify(ended.body.error)).toContain(`This ID was only valid until May 31, ${THIS_YEAR - 1}. Upload your current school ID.`);

    expect(await StudentVerificationRepository.count({ tenantId: student.user._id })).toBe(0);
    expect((await UserRepository.findById(student.user._id)).studentVerificationStatus).toBeNull();
  }, 30000);

  test('only students can submit, and only one submission can wait at a time', async () => {
    const landlord = await makeUser('landlord');
    expect((await submit(landlord.token)).status).toBe(403);

    const student = await makeUser('tenant');
    expect((await submit(student.token)).status).toBe(201);
    const again = await submit(student.token);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('VERIFICATION_ALREADY_PENDING');
  }, 30000);
});

describe('fixing a photo while it waits', () => {
  test('the student can replace the back photo before the admin decides, but not after', async () => {
    const admin = await makeUser('admin');
    const student = await makeUser('tenant');
    const id = (await submit(student.token)).body.data.submission._id;
    const oldBackUrl = (await StudentVerificationRepository.findById(id)).idBackUrl;
    const newBack = Buffer.from('a-clearer-back-photo');

    const replaced = await request(app).patch(`/api/student-verification/${id}/documents`).set(auth(student.token))
      .attach('idBack', newBack, { filename: 'back2.png', contentType: 'image/png' });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data.message).toBe('Photo replaced.');
    expect(Buffer.compare((await photo(admin.token, id, 'back')).body, newBack)).toBe(0);
    const audit = (await AuditLogRepository.findRecent({ action: 'STUDENT_VERIFICATION_DOCUMENTS_REPLACED' })).find((l) => String(l.targetId) === id);
    expect(audit.metadata).toEqual({ documents: ['back'], replaced: { back: oldBackUrl } });

    expect((await review(admin.token, id, { approve: true })).status).toBe(200);
    const late = await request(app).patch(`/api/student-verification/${id}/documents`).set(auth(student.token))
      .attach('idFront', FRONT, { filename: 'front.jpg', contentType: 'image/jpeg' });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('SUBMISSION_ALREADY_REVIEWED');
  }, 30000);
});

describe('the admin review', () => {
  test('a rejection needs a reason, tells the student why, keeps them from reserving, and lets them submit again', async () => {
    const admin = await makeUser('admin');
    const student = await makeUser('tenant');
    const { room } = await makeRoom();
    const id = (await submit(student.token)).body.data.submission._id;

    const noReason = await review(admin.token, id, { approve: false, rejectionReason: '  ' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.code).toBe('REJECTION_REASON_REQUIRED');

    const rejected = await review(admin.token, id, { approve: false, rejectionReason: 'The back photo is blurry.' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.submission).toMatchObject({ status: 'REJECTED', rejectionReason: 'The back photo is blurry.' });
    expect((await UserRepository.findById(student.user._id)).studentVerificationStatus).toBe('REJECTED');
    const notice = await NotificationRepository.findOne({ userId: student.user._id, type: 'STUDENT_VERIFICATION_REJECTED' });
    expect(notice).toMatchObject({ title: 'Student ID needs attention', message: 'Your school ID could not be approved: The back photo is blurry.', link: '/tenant/verification' });

    const blocked = await reserve(student.token, room._id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toBe('Your student ID was not approved. Upload it again under Student verification to reserve.');
    expect((await submit(student.token)).status).toBe(201);
  }, 30000);

  test('the admin can correct the last valid year when approving, but not to before the first year or to a year that has ended', async () => {
    const admin = await makeUser('admin');
    const student = await makeUser('tenant');
    const id = (await submit(student.token, { until: UNTIL + 1 })).body.data.submission._id;

    const beforeFrom = await review(admin.token, id, { approve: true, validUntilYear: FROM - 1 });
    expect(beforeFrom.status).toBe(400);
    expect(beforeFrom.body.error.code).toBe('INVALID_VALID_UNTIL_YEAR');
    const ended = await review(admin.token, id, { approve: true, validUntilYear: THIS_YEAR - 1 });
    expect(ended.status).toBe(400);
    expect(ended.body.error.code).toBe('STUDENT_ID_EXPIRED');

    const corrected = await review(admin.token, id, { approve: true, validUntilYear: UNTIL });
    expect(corrected.status).toBe(200);
    expect(corrected.body.data.submission.validUntilYear).toBe(UNTIL);
    expect((await UserRepository.findById(student.user._id)).studentIdValidUntilYear).toBe(UNTIL);
    const audit = (await AuditLogRepository.findRecent({ action: 'STUDENT_VERIFICATION_REVIEWED' })).find((l) => String(l.targetId) === id);
    expect(audit.metadata).toEqual({ approved: true, validUntilYear: UNTIL, correctedFromYear: UNTIL + 1 });

    const twice = await review(admin.token, id, { approve: false, rejectionReason: 'Changed my mind' });
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('SUBMISSION_ALREADY_REVIEWED');
  }, 30000);

  test('only admins can list or review submissions', async () => {
    const student = await makeUser('tenant');
    const landlord = await makeUser('landlord');
    const id = (await submit(student.token)).body.data.submission._id;
    expect((await request(app).get('/api/admin/student-verifications/pending').set(auth(landlord.token))).status).toBe(403);
    expect((await review(student.token, id, { approve: true })).status).toBe(403);
    expect((await StudentVerificationRepository.findById(id)).status).toBe('PENDING');
  }, 30000);
});

describe('privacy of the ID photos', () => {
  test('only the student who uploaded them and admins can open them; landlords see the school and year, never the photos', async () => {
    const admin = await makeUser('admin');
    const student = await makeUser('tenant');
    const otherStudent = await makeUser('tenant');
    const { landlord, room } = await makeRoom();
    const id = (await submit(student.token)).body.data.submission._id;

    expect((await photo(student.token, id, 'back')).status).toBe(200);
    expect((await photo(admin.token, id, 'back')).status).toBe(200);
    expect((await photo(otherStudent.token, id, 'front')).status).toBe(403);
    expect((await photo(landlord.token, id, 'front')).status).toBe(403);
    expect((await request(app).get(`/api/student-verification/${id}/document/permit`).set(auth(admin.token))).status).toBe(400);
    expect((await request(app).get(`/api/student-verification/${id}/document/front`)).status).toBe(401);

    await review(admin.token, id, { approve: true });
    expect((await reserve(student.token, room._id)).status).toBe(201);
    const listed = await request(app).get('/api/reservations').set(auth(landlord.token));
    const mine = listed.body.data.reservations.find((r) => String(r.tenantId._id) === String(student.user._id));
    expect(mine.tenantId).toMatchObject({ studentVerificationStatus: 'VERIFIED', studentSchool: 'PHINMA University of Pangasinan', studentIdValidUntilYear: UNTIL });
    expect(JSON.stringify(listed.body)).not.toContain('/uploads/student-verification/');
  }, 30000);

  test('deleting the account erases the ID photos, the submissions, the school and the verification', async () => {
    const admin = await makeUser('admin');
    const student = await makeUser('tenant');
    const id = (await submit(student.token)).body.data.submission._id;
    await review(admin.token, id, { approve: true });
    const { idFrontUrl, idBackUrl } = await StudentVerificationRepository.findById(id);

    await UserRepository.updateById(student.user._id, { accountStatus: 'pending_deletion' });
    await require('../../services/AccountDeletionService').erase(admin.user._id, await UserRepository.findById(student.user._id));

    expect(await StudentVerificationRepository.count({ tenantId: student.user._id })).toBe(0);
    await expect(FileStorageService.getByUrl(idFrontUrl, 'student-verification')).rejects.toMatchObject({ statusCode: 404 });
    await expect(FileStorageService.getByUrl(idBackUrl, 'student-verification')).rejects.toMatchObject({ statusCode: 404 });
    const erased = await UserRepository.findById(student.user._id);
    expect(erased.studentSchool ?? null).toBeNull();
    expect(erased.studentVerificationStatus ?? null).toBeNull();
    expect(erased.studentIdValidUntilYear ?? null).toBeNull();
  }, 30000);
});

describe('when the ID stops counting', () => {
  test('an ID valid until a year counts through May 31 of that year in Manila, and stops at June 1', () => {
    const { isStudentIdYearCurrent, studentIdState } = require('../../utils/studentId');
    expect(isStudentIdYearCurrent(2028, new Date('2028-05-31T23:59:59+08:00'))).toBe(true);
    expect(isStudentIdYearCurrent(2028, new Date('2028-06-01T00:00:00+08:00'))).toBe(false);
    const verified = { studentVerificationStatus: 'VERIFIED', studentIdValidUntilYear: 2028 };
    expect(studentIdState(verified, new Date('2028-05-31T12:00:00+08:00'))).toBe('VERIFIED');
    expect(studentIdState(verified, new Date('2028-06-01T08:00:00+08:00'))).toBe('EXPIRED');
    expect(studentIdState({}, new Date())).toBe('NONE');
  });

  test('an expired ID blocks new reservations until a new one is submitted; a current one cannot be resubmitted', async () => {
    const expired = await makeUser('tenant', { studentVerificationStatus: 'VERIFIED', studentSchool: 'University of Luzon', studentIdValidUntilYear: THIS_YEAR - 1 });
    const { room } = await makeRoom();
    const blocked = await reserve(expired.token, room._id);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.message).toBe(`Your student ID was valid until May 31, ${THIS_YEAR - 1}. Upload your current school ID to reserve.`);
    expect((await submit(expired.token)).status).toBe(201);

    const current = await makeUser('tenant', { studentVerificationStatus: 'VERIFIED', studentSchool: 'University of Luzon', studentIdValidUntilYear: UNTIL });
    const again = await submit(current.token);
    expect(again.status).toBe(409);
    expect(again.body.error).toMatchObject({ code: 'STUDENT_ALREADY_VERIFIED', message: `Your student ID is already verified until May 31, ${UNTIL}.` });
  }, 30000);

  test('requests sent before the rule keep going: the landlord can still approve an unverified student\'s pending request', async () => {
    const student = await makeUser('tenant');
    const { landlord, property, room } = await makeRoom();
    const old = await ReservationRepository.create({ tenantId: student.user._id, roomId: room._id, propertyId: property._id, status: 'pending', moveInDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) });

    const approved = await request(app).patch(`/api/reservations/${old._id}/status`).set(auth(landlord.token)).send({ status: 'approved' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.reservation.status).toBe('approved');
  }, 30000);
});
