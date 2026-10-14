// Admins may have a mobile number from a short list of countries; everyone else keeps a Philippine number.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';

const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');
const { isValidAdminPhone, normalizeAdminPhone } = require('../../utils/adminPhone');

let app;
let UserRepository;
let signAccessToken;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  UserRepository = require('../../repositories/UserRepository');
  ({ signAccessToken } = require('../../utils/jwt'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

let seq = 0;
async function makeUser(email, role = 'admin', extra = {}) {
  seq += 1;
  const { hashPassword } = require('../../utils/password');
  return UserRepository.create({
    firstName: 'Phone', lastName: 'Tester', fullName: 'Phone Tester', email,
    phone: `0917777${String(seq).padStart(4, '0')}`, passwordHash: await hashPassword('Str0ng!Pass'), role, accountStatus: 'active',
    ...(role === 'tenant' ? { emergencyContact: { name: 'Ana Tenant', phone: '09171234598' } } : {}),
    ...extra,
  });
}

const as = (user) => ({ Authorization: `Bearer ${signAccessToken(user)}` });
const addAdmin = (main, email, phone) => request(app).post('/api/admin/admins').set(as(main)).send({ firstName: 'Bea', lastName: 'Santos', email, phone });
const fieldError = (res, field) => res.body.error?.details?.find((d) => d.field === field)?.message;

let main;
beforeAll(async () => {
  main = await makeUser('ledgeronboard@gmail.com');
});

test('the listed countries accept mobile numbers of the right length only', () => {
  expect(isValidAdminPhone('+639171234567')).toBe(true);
  expect(isValidAdminPhone('+12015550123')).toBe(true);
  expect(isValidAdminPhone('+447400123456')).toBe(true);
  expect(isValidAdminPhone('+61412345678')).toBe(true);
  expect(isValidAdminPhone('+6581234567')).toBe(true);
  expect(isValidAdminPhone('+85251234567')).toBe(true);
  expect(isValidAdminPhone('+819012345678')).toBe(true);
  expect(isValidAdminPhone('+821012345678')).toBe(true);
  expect(isValidAdminPhone('+971501234567')).toBe(true);
  expect(isValidAdminPhone('+966512345678')).toBe(true);

  expect(isValidAdminPhone('+4474001234')).toBe(false); // too short
  expect(isValidAdminPhone('+4915112345678')).toBe(false); // Germany is not on the list
  expect(isValidAdminPhone('+632123456789')).toBe(false); // Philippine landline, not a mobile
  expect(isValidAdminPhone('09171234567')).toBe(false); // must be in + form after normalizing

  expect(normalizeAdminPhone('+44 7400-123 456')).toBe('+447400123456');
  expect(normalizeAdminPhone('09171234567')).toBe('+639171234567');
});

test('the main admin adds an admin with a foreign number, saved in + form', async () => {
  const res = await addAdmin(main, 'uk.admin@gmail.com', '+44 7400 123456');
  expect(res.status).toBe(201);
  expect((await UserRepository.findByEmail('uk.admin@gmail.com')).phone).toBe('+447400123456');

  const ph = await addAdmin(main, 'ph.admin@gmail.com', '09175550101');
  expect(ph.status).toBe(201);
  expect((await UserRepository.findByEmail('ph.admin@gmail.com')).phone).toBe('+639175550101');
}, 30000);

test('a number from an unlisted country or of the wrong length is refused with a field error', async () => {
  for (const [email, phone] of [['de.admin@gmail.com', '+4915112345678'], ['short.admin@gmail.com', '+6581234'], ['blank.admin@gmail.com', '']]) {
    const res = await addAdmin(main, email, phone);
    expect(res.status).toBe(400);
    expect(fieldError(res, 'phone')).toBe('Phone must be a valid mobile number for the chosen country');
    expect(await UserRepository.findByEmail(email)).toBeNull();
  }
});

test('an admin can change their own phone to a foreign number; other roles stay on Philippine numbers', async () => {
  const admin = await makeUser('profile.admin@gmail.com');
  const res = await request(app).patch('/api/users/me').set(as(admin)).send({ phone: '+65 8123 4567' });
  expect(res.status).toBe(200);
  expect((await UserRepository.findById(admin._id)).phone).toBe('+6581234567');
  const bad = await request(app).patch('/api/users/me').set(as(admin)).send({ phone: '+4915112345678' });
  expect(bad.status).toBe(400);
  expect(fieldError(bad, 'phone')).toBe('Phone must be a valid mobile number for the chosen country');

  for (const role of ['tenant', 'landlord']) {
    const user = await makeUser(`profile.${role}@gmail.com`, role);
    const refused = await request(app).patch('/api/users/me').set(as(user)).send({ phone: '+447400123456' });
    expect(refused.status).toBe(400);
    expect(fieldError(refused, 'phone')).toMatch(/valid Philippine mobile number/);
    expect((await UserRepository.findById(user._id)).phone).toMatch(/^(09|\+639)/);
    expect((await request(app).patch('/api/users/me').set(as(user)).send({ phone: '09181112222' })).status).toBe(200);
  }
});

test('the database itself refuses a foreign number on a new non-admin account', async () => {
  await expect(makeUser('foreign.tenant@gmail.com', 'tenant', { phone: '+447400123456' })).rejects.toThrow(/valid Philippine mobile number/);
  await expect(makeUser('foreign.admin@gmail.com', 'admin', { phone: '+447400123456' })).resolves.toMatchObject({ phone: '+447400123456' });
});
