// npm run demo:rename: renames only the four demo accounts, only their names, and only once.
const { startTestDb, stopTestDb } = require('./helpers/testDb');

let UserRepository;
let AuditLogRepository;
let script;

beforeAll(async () => {
  await startTestDb();
  UserRepository = require('../repositories/UserRepository');
  AuditLogRepository = require('../repositories/AuditLogRepository');
  script = require('../scripts/renameDemoAccounts');
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

let phoneSeq = 0;
const make = (email, firstName, lastName, role) => {
  phoneSeq += 1;
  return UserRepository.create({
    firstName, lastName, fullName: `${firstName} ${lastName}`, email, role, accountStatus: 'active',
    phone: `0917333${String(phoneSeq).padStart(4, '0')}`, passwordHash: 'unchanged-hash',
  });
};

test('renames the existing demo accounts and nothing else; running it again changes nothing', async () => {
  const admin = await make('ledgeronboard@gmail.com', 'Demo', 'Admin', 'admin');
  const landlord = await make('demo.landlord@gmail.com', 'Demo', 'Landlord', 'landlord');
  const caretaker = await make('demo.caretaker@gmail.com', 'Demo', 'Caretaker', 'caretaker');
  const stranger = await make('someone.else@gmail.com', 'Demo', 'Person', 'landlord');
  // demo.tenant@gmail.com does not exist here: it is simply skipped.

  const plan = await script.planRenames();
  expect(plan.map((p) => [p.email, p.fullName])).toEqual([
    ['ledgeronboard@gmail.com', 'Main Admin'],
    ['demo.landlord@gmail.com', 'Gladdiel Landlord'],
    ['demo.caretaker@gmail.com', 'Paul Caretaker'],
  ]);
  await script.applyRenames(plan);

  expect(await UserRepository.findById(admin._id)).toMatchObject({ firstName: 'Main', lastName: 'Admin', fullName: 'Main Admin' });
  expect(await UserRepository.findById(landlord._id)).toMatchObject({ firstName: 'Gladdiel', fullName: 'Gladdiel Landlord' });
  expect(await UserRepository.findById(caretaker._id)).toMatchObject({ firstName: 'Paul', fullName: 'Paul Caretaker' });
  expect((await UserRepository.findById(stranger._id)).fullName).toBe('Demo Person');
  expect((await UserRepository.findByEmail('demo.landlord@gmail.com', { withSecrets: true })).passwordHash).toBe('unchanged-hash');

  const audit = await AuditLogRepository.findRecent({ action: 'DEMO_ACCOUNT_RENAMED_BY_SCRIPT' });
  expect(audit.find((l) => String(l.targetId) === String(landlord._id)).metadata).toEqual({ from: 'Demo Landlord', to: 'Gladdiel Landlord' });

  expect(await script.planRenames()).toEqual([]);
});

test('the names it sets are the ones the seed uses for new databases', () => {
  const seed = require('fs').readFileSync(require('path').join(__dirname, '..', 'utils', 'seed.js'), 'utf8');
  for (const { firstName, lastName } of script.DEMO_NAMES) expect(seed).toContain(`fullName: '${firstName} ${lastName}'`);
});
