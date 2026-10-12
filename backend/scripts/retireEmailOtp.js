/**
 * One-time migration after the email codes were retired (phases 2–5). Run it on your own laptop,
 * from the backend folder, first as a dry run:
 *
 *     npm run migrate:retire-email-otp -- --dry-run
 *     npm run migrate:retire-email-otp
 *
 * It fixes three groups of accounts:
 *  1. Old email two-factor: two-factor switched on without an authenticator secret. Two-factor is
 *     turned off (those accounts already sign in with just their password) and any pending
 *     email sign-in code is cleared. The account gets an in-app notification.
 *  2. Unverified accounts from when sign-up email verification was on: marked verified and any
 *     pending verification code cleared. No notification (nothing changes for them: they have
 *     been able to sign in since phase 2).
 *  3. Any account whose saved password still matches the old shared caretaker password, whatever
 *     its status: the password becomes unusable, every session ends. A caretaker's landlord gets
 *     an in-app notification (a new activation code, or an administrator's reset code, gets them in).
 *
 * Every changed account gets an audit entry. Nothing is deleted and nothing is emailed. It prints
 * counts only, never emails or names, and a second run changes nothing.
 *
 * - MONGODB_URI is read from your own environment, or else from backend/.env (git-ignored). Only
 *   MONGODB_URI is needed. It is never printed, and errors have it masked.
 * - It refuses to run without an interactive terminal; a real run asks you to type YES first.
 * - Against MongoDB Atlas, your IP address must be allowed under Network Access.
 */
const path = require('path');
const readline = require('readline');

// Your own environment wins; backend/.env only fills in what is missing.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { MFA_METHOD, ACCOUNT_STATUS, ROLES } = require('../utils/constants');

// Task 6.3: the shared temporary password every caretaker was given before phase 5.
const LEGACY_SHARED_PASSWORD = 'caretaker1234';
const CLEARED_CODE_SLOT = { codeHash: null, purpose: null, expiresAt: null, attempts: 0 };

const GROUPS = Object.freeze({
  emailTwoFactor: 'Old email two-factor turned off',
  unverified: 'Unverified accounts marked verified',
  sharedPassword: 'Old shared caretaker password retired',
});

/** Two-factor switched on without an authenticator secret (MfaService.isEnrolled is false for these). */
const EMAIL_TWO_FACTOR_FILTER = {
  mfaEnabled: true,
  $or: [{ mfaMethod: { $ne: MFA_METHOD.TOTP } }, { 'mfaTotp.secretEnc': null }],
};
const UNVERIFIED_FILTER = { emailVerified: false };

function redactConnectionStrings(text) {
  return String(text).replace(/mongodb(\+srv)?:\/\/\S+/gi, '[connection string hidden]');
}

function parseArgs(argv) {
  return { dryRun: argv.includes('--dry-run'), help: argv.includes('--help') || argv.includes('-h') };
}

/** Accounts whose saved hash matches the old shared password: [{ _id, role, accountStatus, assignedLandlordId, fullName, passwordHash }]. */
async function findSharedPasswordAccounts() {
  const User = require('../models/User');
  const { comparePassword } = require('../utils/password');
  const matches = [];
  const cursor = User.find({ passwordHash: { $type: 'string' } })
    .select('+passwordHash role accountStatus assignedLandlordId fullName')
    .cursor();
  for await (const user of cursor) {
    if (await comparePassword(LEGACY_SHARED_PASSWORD, user.passwordHash)) matches.push(user);
  }
  return matches;
}

/** How many accounts each group would change. Changes nothing. */
async function countTargets() {
  const User = require('../models/User');
  return {
    emailTwoFactor: await User.countDocuments(EMAIL_TWO_FACTOR_FILTER),
    unverified: await User.countDocuments(UNVERIFIED_FILTER),
    sharedPassword: (await findSharedPasswordAccounts()).length,
  };
}

async function audit(action, userId, metadata = {}) {
  const AuditLogRepository = require('../repositories/AuditLogRepository');
  await AuditLogRepository.record({ action, actorRole: 'system', targetType: 'User', targetId: userId, metadata: { via: 'migration', ...metadata } });
}

/**
 * Applies the changes and returns how many accounts each group changed. Expects an open mongoose
 * connection. Every update repeats its group's condition, so a second run (or a parallel one)
 * changes nothing twice.
 */
async function applyChanges() {
  const User = require('../models/User');
  const { unusablePasswordHash } = require('../utils/password');
  const NotificationService = require('../services/NotificationService');
  const changed = { emailTwoFactor: 0, unverified: 0, sharedPassword: 0 };

  // 1. Old email two-factor.
  for (const user of await User.find(EMAIL_TWO_FACTOR_FILTER).select('_id role')) {
    const result = await User.updateOne({ _id: user._id, ...EMAIL_TWO_FACTOR_FILTER }, { $set: { mfaEnabled: false, mfaMethod: MFA_METHOD.NONE } });
    if (!result.modifiedCount) continue;
    await User.updateOne({ _id: user._id, 'otp.purpose': 'login_mfa' }, { $set: { otp: CLEARED_CODE_SLOT } });
    changed.emailTwoFactor += 1;
    await audit('EMAIL_TWO_FACTOR_RETIRED', user._id);
    await NotificationService.notify({
      userId: user._id,
      type: 'SECURITY',
      title: 'Email sign-in codes have been retired',
      message: 'You now sign in with just your password. To protect your account, turn on two-factor sign-in with an authenticator app in your Profile.',
      link: `/${user.role}/profile`,
    });
  }

  // 2. Unverified accounts.
  for (const user of await User.find(UNVERIFIED_FILTER).select('_id')) {
    const result = await User.updateOne({ _id: user._id, ...UNVERIFIED_FILTER }, { $set: { emailVerified: true } });
    if (!result.modifiedCount) continue;
    await User.updateOne({ _id: user._id, 'otp.purpose': 'email_verification' }, { $set: { otp: CLEARED_CODE_SLOT } });
    changed.unverified += 1;
    await audit('EMAIL_VERIFICATION_RETIRED', user._id);
  }

  // 3. The old shared caretaker password, whatever the account's status.
  for (const user of await findSharedPasswordAccounts()) {
    const result = await User.updateOne(
      { _id: user._id, passwordHash: user.passwordHash },
      { $set: { passwordHash: await unusablePasswordHash(), refreshTokenHash: null }, $inc: { tokenVersion: 1 } },
    );
    if (!result.modifiedCount) continue;
    changed.sharedPassword += 1;
    await audit('SHARED_PASSWORD_RETIRED', user._id, { accountStatus: user.accountStatus });
    if (user.role === ROLES.CARETAKER && user.assignedLandlordId) {
      const pending = user.accountStatus === ACCOUNT_STATUS.PENDING_ACTIVATION;
      await NotificationService.notify({
        userId: user.assignedLandlordId,
        type: 'CARETAKER_ACCESS',
        title: 'A caretaker needs a new code',
        message: pending
          ? `${user.fullName}'s old temporary password no longer works. Give them a new activation code from Caretakers.`
          : `${user.fullName}'s old temporary password no longer works. An administrator can give them a password reset code.`,
        relatedType: 'User',
        relatedId: user._id,
        link: '/landlord/caretakers',
      });
    }
  }

  return changed;
}

function formatCounts(counts) {
  return Object.entries(GROUPS).map(([key, label]) => `  ${label}: ${counts[key]}`).join('\n');
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

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: npm run migrate:retire-email-otp -- --dry-run   (counts only)\n       npm run migrate:retire-email-otp             (asks for YES, then applies)');
    return 0;
  }
  if (!process.stdin.isTTY) {
    console.error('Run this in an interactive terminal (PowerShell or Windows Terminal, not Git Bash).');
    return 1;
  }
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
    console.log('Checking accounts (this compares each saved password once, so it can take a minute)...');
    const counts = await countTargets();
    console.log(`Accounts to change:\n${formatCounts(counts)}`);
    if (args.dryRun) {
      console.log('Dry run: nothing changed.');
      return 0;
    }
    if (!Object.values(counts).some(Boolean)) {
      console.log('Nothing to change.');
      return 0;
    }
    const confirm = await ask('Apply these changes? Type YES to continue: ');
    if (confirm.trim() !== 'YES') {
      console.log('Nothing changed.');
      return 1;
    }
    const changed = await applyChanges();
    console.log(`Changed:\n${formatCounts(changed)}\nDone. Running it again will change nothing.`);
    return 0;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`Failed: ${redactConnectionStrings(err.message)}`);
      process.exit(1);
    });
}

module.exports = { countTargets, applyChanges, formatCounts, parseArgs, redactConnectionStrings, main, LEGACY_SHARED_PASSWORD };
