// Phase 6 migration (scripts/retireEmailOtp.js), run against an in-memory database: old email
// two-factor, unverified accounts, and saved copies of the old shared caretaker password (6.3).
const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');

let User;
let UserRepository;
let AuditLogRepository;
let NotificationRepository;
let EmailService;
let hashPassword;
let comparePassword;
let unusablePasswordHash;
let hashOtp;
let script;

beforeAll(async () => {
  await startTestDb();
  User = require('../models/User');
  UserRepository = require('../repositories/UserRepository');
  AuditLogRepository = require('../repositories/AuditLogRepository');
  NotificationRepository = require('../repositories/NotificationRepository');
  EmailService = require('../services/EmailService');
  ({ hashPassword, comparePassword, unusablePasswordHash } = require('../utils/password'));
  ({ hashOtp } = require('../utils/otp'));
  script = require('../scripts/retireEmailOtp');
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const PASSWORD = 'Str0ng!Pass';
const SHARED = 'caretaker1234'; // the old shared caretaker password (task 6.3)
let phoneSeq = 0;

async function makeUser(email, extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Mig', lastName: 'User', fullName: 'Mig User', email,
    phone: `0917555${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role: 'tenant', accountStatus: 'active',
    ...extra,
  });
}

const codeSlot = async (purpose) => ({ codeHash: await hashOtp('123456'), purpose, expiresAt: new Date(Date.now() + 600000), attempts: 0 });
const auditsFor = async (action, id) => (await AuditLogRepository.findRecent({ action })).filter((l) => String(l.targetId) === String(id));
const notificationsFor = (id) => NotificationRepository.model.find({ userId: id }).lean();

/** Every account the migration must touch, plus look-alikes it must leave alone. */
async function seed() {
  const landlord = await makeUser('mig.landlord@gmail.com', { role: 'landlord' });
  return {
    landlord,
    emailMfa: await makeUser('mig.emailmfa@gmail.com', { mfaEnabled: true, mfaMethod: 'email', otp: await codeSlot('login_mfa') }),
    totpNoSecret: await makeUser('mig.totpnosecret@gmail.com', { role: 'landlord', mfaEnabled: true, mfaMethod: 'totp' }),
    totpEnrolled: await makeUser('mig.totp@gmail.com', { mfaEnabled: true, mfaMethod: 'totp', mfaTotp: { secretEnc: 'v1:encrypted-secret' } }),
    unverified: await makeUser('mig.unverified@gmail.com', { emailVerified: false, otp: await codeSlot('email_verification') }),
    oldStylePending: await makeUser('mig.oldcaretaker@gmail.com', {
      role: 'caretaker', accountStatus: 'pending_activation', passwordHash: await hashPassword(SHARED), assignedLandlordId: landlord._id,
    }),
    sharedActive: await makeUser('mig.sharedactive@gmail.com', { role: 'caretaker', passwordHash: await hashPassword(SHARED), assignedLandlordId: landlord._id }),
    sharedTenant: await makeUser('mig.sharedtenant@gmail.com', { passwordHash: await hashPassword(SHARED), refreshTokenHash: 'saved-session' }),
    newCaretaker: await makeUser('mig.newcaretaker@gmail.com', { role: 'caretaker', accountStatus: 'pending_activation', passwordHash: await unusablePasswordHash(), assignedLandlordId: landlord._id }),
    ordinary: await makeUser('mig.ordinary@gmail.com'),
  };
}

const snapshot = async () => JSON.stringify(await User.find({}).select('+passwordHash +otp.codeHash +otp.purpose +refreshTokenHash +mfaTotp.secretEnc').sort({ email: 1 }).lean());

describe('the migration', () => {
  let accounts;

  beforeAll(async () => {
    await clearCollections();
    accounts = await seed();
  });

  test('a dry run counts all three groups and changes nothing', async () => {
    const before = await snapshot();

    const counts = await script.countTargets();

    expect(counts).toEqual({ emailTwoFactor: 2, unverified: 1, sharedPassword: 3 });
    expect(await snapshot()).toBe(before);
    expect(await AuditLogRepository.model.countDocuments({})).toBe(0);
    expect(await NotificationRepository.model.countDocuments({})).toBe(0);
  }, 60000);

  test('a real run changes exactly those accounts, sends nothing, and reports the same counts', async () => {
    const sendSpy = jest.spyOn(EmailService, 'send');

    const changed = await script.applyChanges();

    expect(changed).toEqual({ emailTwoFactor: 2, unverified: 1, sharedPassword: 3 });
    expect(sendSpy).not.toHaveBeenCalled();
  }, 60000);

  test('old email two-factor is off, its pending code cleared, with an audit entry and a notification; real authenticator setups are untouched', async () => {
    for (const account of [accounts.emailMfa, accounts.totpNoSecret]) {
      const stored = await UserRepository.findByIdWithSecrets(account._id);
      expect(stored.mfaEnabled).toBe(false);
      expect(stored.mfaMethod).toBe('none');
      expect(await auditsFor('EMAIL_TWO_FACTOR_RETIRED', account._id)).toHaveLength(1);
      const notes = await notificationsFor(account._id);
      expect(notes).toHaveLength(1);
      expect(notes[0].link).toBe(`/${account.role}/profile`);
    }
    expect((await UserRepository.findByIdWithSecrets(accounts.emailMfa._id)).otp.codeHash).toBeNull();

    const enrolled = await UserRepository.findByIdWithSecrets(accounts.totpEnrolled._id);
    expect(enrolled.mfaEnabled).toBe(true);
    expect(enrolled.mfaMethod).toBe('totp');
    expect(enrolled.mfaTotp.secretEnc).toBe('v1:encrypted-secret');
  });

  test('unverified accounts are verified, their pending code cleared, with an audit entry and no notification', async () => {
    const stored = await UserRepository.findByIdWithSecrets(accounts.unverified._id);
    expect(stored.emailVerified).toBe(true);
    expect(stored.otp.codeHash).toBeNull();
    expect(await auditsFor('EMAIL_VERIFICATION_RETIRED', accounts.unverified._id)).toHaveLength(1);
    expect(await notificationsFor(accounts.unverified._id)).toHaveLength(0);
  });

  test('every saved copy of the shared password is unusable, whatever the status; sessions end; landlords of caretakers are told', async () => {
    for (const account of [accounts.oldStylePending, accounts.sharedActive, accounts.sharedTenant]) {
      const stored = await UserRepository.findByIdWithSecrets(account._id);
      expect(await comparePassword(SHARED, stored.passwordHash)).toBe(false);
      expect(stored.tokenVersion).toBe(1);
      expect(stored.refreshTokenHash).toBeNull();
      expect(stored.accountStatus).toBe(account.accountStatus); // status itself unchanged
      expect(await auditsFor('SHARED_PASSWORD_RETIRED', account._id)).toHaveLength(1);
    }
    const landlordNotes = await notificationsFor(accounts.landlord._id);
    expect(landlordNotes).toHaveLength(2); // the two caretakers, not the tenant
    expect(landlordNotes.find((n) => String(n.relatedId) === String(accounts.oldStylePending._id)).message).toMatch(/new activation code/);
    expect(landlordNotes.find((n) => String(n.relatedId) === String(accounts.sharedActive._id)).message).toMatch(/administrator can give them a password reset code/);
  });

  test('accounts outside the three groups are untouched', async () => {
    for (const account of [accounts.ordinary, accounts.newCaretaker, accounts.totpEnrolled, accounts.landlord]) {
      const stored = await UserRepository.findByIdWithSecrets(account._id);
      expect(stored.passwordHash).toBe(account.passwordHash);
      expect(stored.tokenVersion || 0).toBe(0);
      expect(await AuditLogRepository.model.countDocuments({ targetId: account._id })).toBe(0);
    }
    expect(await comparePassword(PASSWORD, (await UserRepository.findByIdWithSecrets(accounts.ordinary._id)).passwordHash)).toBe(true);
  });

  test('a second run finds nothing and changes nothing', async () => {
    const before = await snapshot();
    const audits = await AuditLogRepository.model.countDocuments({});
    const notes = await NotificationRepository.model.countDocuments({});

    expect(await script.countTargets()).toEqual({ emailTwoFactor: 0, unverified: 0, sharedPassword: 0 });
    expect(await script.applyChanges()).toEqual({ emailTwoFactor: 0, unverified: 0, sharedPassword: 0 });

    expect(await snapshot()).toBe(before);
    expect(await AuditLogRepository.model.countDocuments({})).toBe(audits);
    expect(await NotificationRepository.model.countDocuments({})).toBe(notes);
  }, 60000);

  test('the old-style caretaker can then get a code from their landlord and activate', async () => {
    const AuthService = require('../services/AuthService');
    const { activationCode } = await AuthService.resendCaretakerInvitation(accounts.landlord._id, accounts.oldStylePending._id);

    await AuthService.activateCaretakerAccount({ email: 'mig.oldcaretaker@gmail.com', code: activationCode, password: 'N3w!Password' });

    expect((await UserRepository.findById(accounts.oldStylePending._id)).accountStatus).toBe('active');
  }, 30000);
});

describe('what the script prints and refuses', () => {
  test('its output is counts only: no emails or names', () => {
    const text = script.formatCounts({ emailTwoFactor: 2, unverified: 1, sharedPassword: 3 });
    expect(text).toBe('  Old email two-factor turned off: 2\n  Unverified accounts marked verified: 1\n  Old shared caretaker password retired: 3');
    expect(text).not.toMatch(/@|Mig User/);
  });

  test('without an interactive terminal it refuses before connecting', async () => {
    const mongoose = require('mongoose');
    const connectSpy = jest.spyOn(mongoose, 'connect');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const original = process.stdin.isTTY;
    process.stdin.isTTY = false;
    try {
      expect(await script.main(['--dry-run'])).toBe(1);
    } finally {
      process.stdin.isTTY = original;
    }
    expect(connectSpy).not.toHaveBeenCalled();
    expect(errorSpy.mock.calls[0][0]).toMatch(/interactive terminal/);
  });

  test('reads --dry-run, and masks connection strings in anything it prints', () => {
    expect(script.parseArgs(['--dry-run'])).toEqual({ dryRun: true, help: false });
    expect(script.parseArgs([])).toEqual({ dryRun: false, help: false });
    expect(script.redactConnectionStrings('failed for mongodb+srv://user:secret@db.example.invalid/db?x=1 here')).toBe('failed for [connection string hidden] here');
  });

  test('needs only MONGODB_URI: the script and password hashing load without the JWT secrets', () => {
    jest.isolateModules(() => {
      const saved = { ...process.env };
      try {
        process.env.NODE_ENV = 'development';
        process.env.MONGODB_URI = 'mongodb://127.0.0.1:1/unused';
        delete process.env.JWT_SECRET;
        delete process.env.JWT_REFRESH_SECRET;
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        expect(() => require('../scripts/retireEmailOtp')).not.toThrow();
        expect(() => require('../utils/password')).not.toThrow();
        expect(() => require('../config/env')).toThrow(/JWT_SECRET/); // the app itself still needs them
      } finally {
        process.env = saved;
      }
    });
  });
});
