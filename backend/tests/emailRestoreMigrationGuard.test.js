const crypto = require('crypto');
const { startTestDb, stopTestDb, clearCollections } = require('./helpers/testDb');
let Users, script;
beforeAll(async () => {
  await startTestDb();
  Users = require('../models/User');
  script = require('../scripts/retireEmailOtp');
}, 60000);
afterAll(() => stopTestDb());
beforeEach(() => clearCollections());
test('the old cleanup excludes newly confirmed email two-factor accounts', async () => {
  const user = await Users.create({ firstName: 'Guard', lastName: 'Tester', fullName: 'Guard Tester',
    email: `migration-guard-${crypto.randomUUID()}@gmail.com`, phone: '09171112223',
    passwordHash: crypto.randomBytes(64).toString('hex'), role: 'tenant', mfaEnabled: true, mfaMethod: 'email' });
  // A raw update makes this regression runnable with the old schema too.
  await Users.collection.updateOne({ _id: user._id }, { $set: { emailMfaEnabledAt: new Date() } });
  expect((await script.countTargets()).emailTwoFactor).toBe(0);
});
test('the old cleanup refuses to run while restored email flows or registration verification are enabled', async () => {
  const names = ['EMAIL_ACCOUNT_FLOWS_ENABLED', 'EMAIL_VERIFICATION_REQUIRED'];
  for (const name of names) {
    const previous = process.env[name];
    process.env[name] = 'true';
    try { await expect(script.applyChanges()).rejects.toThrow(/email.*enabled/i); }
    finally {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  }
});
