/**
 * Creates the main admin account (MAIN_ADMIN_EMAIL, default ledgeronboard@gmail.com) when a
 * database doesn't have it yet. There are no demo accounts: every other account is a real one,
 * registered through the app, so nothing the app sends goes to an inbox nobody owns.
 * The first password comes from SEED_DEMO_PASSWORD in backend/.env — it is never stored in the
 * code, because this repository is public and the database is live. An existing admin account is
 * left untouched. Run: npm run seed
 */
require('dotenv').config();
const { connectDB, disconnectDB } = require('../config/db');
const env = require('../config/env');
const UserRepository = require('../repositories/UserRepository');
const { hashPassword } = require('./password');
const { ROLES, ACCOUNT_STATUS } = require('./constants');

const ADMIN_PASSWORD = process.env.SEED_DEMO_PASSWORD;
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
if (!ADMIN_PASSWORD || !STRONG_PASSWORD.test(ADMIN_PASSWORD)) {
  // eslint-disable-next-line no-console
  console.error('[seed] Set SEED_DEMO_PASSWORD in backend/.env to a strong password (8+ chars, upper, lower, number, symbol).');
  process.exit(1);
}

async function main() {
  await connectDB();

  const email = env.mainAdminEmail;
  let admin = await UserRepository.findByEmail(email);
  const created = !admin;
  if (!admin) {
    admin = await UserRepository.create({
      firstName: 'Ledger OnBoard',
      lastName: 'Admin',
      fullName: 'Ledger OnBoard Admin',
      email,
      phone: '09170000001',
      role: ROLES.ADMIN,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      privacyConsent: { given: true, at: new Date() },
    });
  }

  // eslint-disable-next-line no-console
  console.log(created
    ? `Seed complete. Created the main admin ${admin.email} with the password from SEED_DEMO_PASSWORD; change it after signing in.`
    : `Seed complete. The main admin ${admin.email} already exists; nothing changed.`);

  await disconnectDB();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', err);
  process.exit(1);
});
