/**
 * Local admin tool: give the seeded demo accounts their display names. `npm run seed` never
 * changes accounts that already exist, so this updates them in place. Run it on your own laptop,
 * from the backend folder:
 *
 *     npm run demo:rename
 *
 * - Only the four demo emails below are touched, and only firstName, lastName and fullName.
 *   Passwords, sessions and every record (properties, bills, payments) stay as they are.
 * - The database connection string is read from MONGODB_URI in your own environment, or else from
 *   backend/.env (git-ignored). It is never printed, and errors have it masked.
 * - It lists the changes and asks you to type YES before saving anything.
 * - Against MongoDB Atlas, your IP address must be allowed under Network Access first.
 */
const path = require('path');
const readline = require('readline');

// Your own environment wins; backend/.env only fills in what is missing.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DEMO_NAMES = Object.freeze([
  { email: 'ledgeronboard@gmail.com', firstName: 'Ledger OnBoard', lastName: 'Admin' },
  { email: 'demo.landlord@gmail.com', firstName: 'Gladdiel', lastName: 'Landlord' },
  { email: 'demo.tenant@gmail.com', firstName: 'Paula', lastName: 'Tenant' },
  { email: 'demo.caretaker@gmail.com', firstName: 'Paul', lastName: 'Caretaker' },
]);

function redactConnectionStrings(text) {
  return String(text).replace(/mongodb(\+srv)?:\/\/\S+/gi, '[connection string hidden]');
}

/** The demo accounts that exist and still need a new name. Expects an open mongoose connection. */
async function planRenames() {
  const UserRepository = require('../repositories/UserRepository');
  const plan = [];
  for (const target of DEMO_NAMES) {
    // eslint-disable-next-line no-await-in-loop
    const user = await UserRepository.findByEmail(target.email);
    const fullName = `${target.firstName} ${target.lastName}`;
    if (user && user.fullName !== fullName) plan.push({ user, ...target, fullName });
  }
  return plan;
}

async function applyRenames(plan) {
  const UserRepository = require('../repositories/UserRepository');
  const AuditLogRepository = require('../repositories/AuditLogRepository');
  for (const { user, firstName, lastName, fullName } of plan) {
    // eslint-disable-next-line no-await-in-loop
    await UserRepository.updateById(user._id, { firstName, lastName, fullName });
    // eslint-disable-next-line no-await-in-loop
    await AuditLogRepository.record({
      action: 'DEMO_ACCOUNT_RENAMED_BY_SCRIPT', actorRole: 'system', targetType: 'User', targetId: user._id,
      metadata: { from: user.fullName, to: fullName },
    });
  }
}

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  // Only MONGODB_URI is needed: the app's config/env (which also requires the JWT secrets) is never loaded.
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is not set. Set it in your own environment, or in backend/.env (git-ignored).');
    return 1;
  }
  const mongoose = require('mongoose');
  if (mongoUri.startsWith('mongodb+srv://')) require('dns').setServers(['8.8.8.8', '1.1.1.1']); // same as config/db.js

  console.log('Connecting to the database...');
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 45000 });
  try {
    const plan = await planRenames();
    if (plan.length === 0) {
      console.log('All demo accounts already have their names. Nothing to change.');
      return 0;
    }
    console.log('These accounts will be renamed:');
    for (const { email, user, fullName } of plan) console.log(`  ${email}: ${user.fullName} -> ${fullName}`);
    const confirm = await ask('Type YES to rename them: ');
    if (confirm.trim() !== 'YES') {
      console.log('Nothing changed.');
      return 1;
    }
    await applyRenames(plan);
    console.log(`Renamed ${plan.length} account${plan.length === 1 ? '' : 's'}. They see the new name the next time a page loads.`);
    return 0;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Failed: ${redactConnectionStrings(err.message)}`);
      process.exit(1);
    });
}

module.exports = { DEMO_NAMES, planRenames, applyRenames };
