// The local admin password script (scripts/resetUserPassword.js), run against an in-memory database.
const { startTestDb, stopTestDb } = require('./helpers/testDb');

let UserRepository;
let AuditLogRepository;
let comparePassword;
let hashPassword;
let script;

beforeAll(async () => {
  await startTestDb();
  UserRepository = require('../repositories/UserRepository');
  AuditLogRepository = require('../repositories/AuditLogRepository');
  ({ comparePassword, hashPassword } = require('../utils/password'));
  script = require('../scripts/resetUserPassword');
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const NEW_PASSWORD = 'Scr1pt!Reset';

async function makeUser(email, role = 'admin') {
  return UserRepository.create({
    firstName: 'Locked', lastName: 'Out', fullName: 'Locked Out', email, phone: '09179990001',
    passwordHash: await hashPassword('Old!Passw0rd'), role, accountStatus: 'active',
    refreshTokenHash: 'abc123',
    otp: { codeHash: 'old-hash', purpose: 'password_reset', expiresAt: new Date(Date.now() + 60000), attempts: 2 },
  });
}

test('sets the new password, ends saved sign-ins, clears pending codes, and writes an audit entry without the password', async () => {
  const user = await makeUser('locked.admin@gmail.com');
  const logged = [];
  for (const level of ['log', 'info', 'warn', 'error']) {
    jest.spyOn(console, level).mockImplementation((...args) => logged.push(args.join(' ')));
  }

  const result = await script.resetUserPassword({ email: 'locked.admin@gmail.com', newPassword: NEW_PASSWORD });

  expect(result).toEqual({ email: 'locked.admin@gmail.com', fullName: 'Locked Out', role: 'admin' });
  const stored = await UserRepository.findByIdWithSecrets(user._id);
  expect(await comparePassword(NEW_PASSWORD, stored.passwordHash)).toBe(true);
  expect(stored.refreshTokenHash).toBeNull();
  expect(stored.otp.codeHash).toBeNull();
  expect(stored.tokenVersion).toBe(1); // every device signed out

  const audit = (await AuditLogRepository.findRecent({ action: 'PASSWORD_RESET_BY_SCRIPT' })).find((l) => String(l.targetId) === String(user._id));
  expect(audit).toMatchObject({ actorRole: 'system', metadata: { via: 'local-script' } });
  expect(JSON.stringify(audit)).not.toContain(NEW_PASSWORD);
  expect(logged.join('\n')).not.toContain(NEW_PASSWORD);
});

test('an unknown email changes nothing', async () => {
  await expect(script.resetUserPassword({ email: 'nobody.script@gmail.com', newPassword: NEW_PASSWORD })).rejects.toThrow('No account found for nobody.script@gmail.com.');
});

test('a weak password is refused and nothing changes', async () => {
  const user = await makeUser('weak.script@gmail.com', 'tenant');
  for (const weak of ['', 'short1!', 'nouppercase1!', 'NoSpecial123', 'Has Space1!']) {
    await expect(script.resetUserPassword({ email: 'weak.script@gmail.com', newPassword: weak })).rejects.toThrow(/password/i);
  }
  const stored = await UserRepository.findByIdWithSecrets(user._id);
  expect(await comparePassword('Old!Passw0rd', stored.passwordHash)).toBe(true);
  expect(stored.refreshTokenHash).toBe('abc123');
});

test('reads --email in either form, lower-cased', () => {
  expect(script.parseArgs(['--email', ' Admin@Gmail.com '])).toEqual({ email: 'admin@gmail.com', help: false });
  expect(script.parseArgs(['--email=admin@gmail.com'])).toEqual({ email: 'admin@gmail.com', help: false });
  expect(script.parseArgs([])).toEqual({ email: null, help: false });
  expect(script.parseArgs(['--help']).help).toBe(true);
});

test('connection strings are masked in any message it prints', () => {
  const message = 'getaddrinfo ENOTFOUND for mongodb+srv://user:p%40ss@cluster0.abcd.mongodb.net/ledger?retryWrites=true and mongodb://u:p@127.0.0.1:27017/x';
  const masked = script.redactConnectionStrings(message);
  expect(masked).not.toMatch(/mongodb/);
  expect(masked).not.toContain('p%40ss');
  expect(masked).toContain('[connection string hidden]');
});

test('the script never reads or prints a connection string from the repo itself', () => {
  const fs = require('fs');
  const source = fs.readFileSync(require.resolve('../scripts/resetUserPassword'), 'utf8');
  expect(source).not.toMatch(/mongodb(\+srv)?:\/\/[^'"\s]*@/); // no hard-coded credentials
  // The value is never logged (mentioning the variable's name in a help message is fine).
  expect(source).not.toMatch(/console\.\w+\([^)]*env\.mongoUri/);
  expect(source).not.toMatch(/console\.\w+\([^)]*process\.env\.MONGODB_URI/);
});
