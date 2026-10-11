/**
 * Local admin tool: give one account a new password (for example, an administrator who is
 * locked out). Run it on your own laptop, from the backend folder:
 *
 *     npm run password:reset -- --email someone@gmail.com
 *
 * - The database connection string is read from MONGODB_URI in your own environment, or else from
 *   backend/.env (git-ignored). It is never printed, and errors have it masked.
 * - The new password is typed twice at a hidden prompt. It is never printed or logged.
 * - The account's saved sign-in (refresh token) and any pending code are cleared, and an audit
 *   entry (PASSWORD_RESET_BY_SCRIPT) is written without the password.
 * - Against MongoDB Atlas, your IP address must be allowed under Network Access first.
 */
const path = require('path');
const readline = require('readline');

// Your own environment wins; backend/.env only fills in what is missing. Loaded before config/env.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { STRONG_PASSWORD, WHITESPACE } = require('../validators/patterns');

const PASSWORD_RULE = 'at least 8 characters (max 128), no spaces, with an uppercase letter, a lowercase letter, a number and a special character';

/** Hides anything that looks like a MongoDB connection string. */
function redactConnectionStrings(text) {
  return String(text).replace(/mongodb(\+srv)?:\/\/\S+/gi, '[connection string hidden]');
}

function parseArgs(argv) {
  const args = { email: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
    else if (argv[i] === '--email') args.email = (argv[i + 1] || '').trim().toLowerCase() || null;
    else if (argv[i].startsWith('--email=')) args.email = argv[i].slice('--email='.length).trim().toLowerCase() || null;
  }
  return args;
}

function passwordProblem(password) {
  if (!password) return 'The password is empty.';
  if (WHITESPACE.test(password)) return 'The password must not contain spaces.';
  if (password.length > 128 || !STRONG_PASSWORD.test(password)) return `The password must be ${PASSWORD_RULE}.`;
  return null;
}

/**
 * Sets the new password. Expects an open mongoose connection. Returns the account's email,
 * name and role; throws if the email is unknown or the password is too weak.
 */
async function resetUserPassword({ email, newPassword }) {
  const UserRepository = require('../repositories/UserRepository');
  const AuditLogRepository = require('../repositories/AuditLogRepository');
  const { hashPassword } = require('../utils/password');

  const problem = passwordProblem(newPassword);
  if (problem) throw new Error(problem);
  const user = await UserRepository.findByEmail(email);
  if (!user) throw new Error(`No account found for ${email}.`);

  await UserRepository.updateById(user._id, {
    passwordHash: await hashPassword(newPassword),
    refreshTokenHash: null,
    $inc: { tokenVersion: 1 }, // signs every device out
    otp: { codeHash: null, purpose: null, expiresAt: null, attempts: 0 },
    'passwordReset.failedAttempts': 0,
    'passwordReset.lockedUntil': null,
  });
  await AuditLogRepository.record({
    action: 'PASSWORD_RESET_BY_SCRIPT',
    actorRole: 'system',
    targetType: 'User',
    targetId: user._id,
    metadata: { via: 'local-script' },
  });
  return { email: user.email, fullName: user.fullName, role: user.role };
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

/** Reads a line without echoing what is typed. */
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let promptShown = false;
    // Show the question once, then nothing that is typed.
    rl._writeToOutput = (text) => {
      if (!promptShown) {
        promptShown = true;
        rl.output.write(text);
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main(argv) {
  const args = parseArgs(argv);
  if (args.help || !args.email) {
    console.log('Usage: npm run password:reset -- --email someone@gmail.com');
    return args.help ? 0 : 1;
  }
  if (!process.stdin.isTTY) {
    console.error('Run this in an interactive terminal, so the password can be typed at a hidden prompt.');
    return 1;
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Set it in your own environment, or in backend/.env (git-ignored).');
    return 1;
  }

  const env = require('../config/env');
  const mongoose = require('mongoose');
  if (env.mongoUri.startsWith('mongodb+srv://')) require('dns').setServers(['8.8.8.8', '1.1.1.1']); // same as config/db.js

  console.log('Connecting to the database...');
  await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 45000 });
  try {
    const UserRepository = require('../repositories/UserRepository');
    const user = await UserRepository.findByEmail(args.email);
    if (!user) {
      console.error(`No account found for ${args.email}.`);
      return 1;
    }
    const confirm = await ask(`Set a new password for ${user.fullName} (${user.role}, ${user.accountStatus})? Type YES to continue: `);
    if (confirm.trim() !== 'YES') {
      console.log('Nothing changed.');
      return 1;
    }

    console.log(`The new password must be ${PASSWORD_RULE}.`);
    const first = await askHidden('New password: ');
    const problem = passwordProblem(first);
    if (problem) {
      console.error(`${problem} Nothing changed.`);
      return 1;
    }
    const second = await askHidden('Type it again: ');
    if (first !== second) {
      console.error('The passwords do not match. Nothing changed.');
      return 1;
    }

    const result = await resetUserPassword({ email: args.email, newPassword: first });
    console.log(`Password updated for ${result.email}. They must sign in again on every device.`);
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

module.exports = { resetUserPassword, parseArgs, passwordProblem, redactConnectionStrings };
