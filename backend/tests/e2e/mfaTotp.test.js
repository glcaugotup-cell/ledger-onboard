// Authenticator-app two-factor, end to end: enrollment, the sign-in challenge, limits, replay
// protection, backup codes and the retired email method. Codes are generated the way an app would.
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.SENSITIVE_AUTH_RATE_LIMIT_MAX = '1000';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { startTestDb, stopTestDb } = require('../helpers/testDb');

let app;
let env;
let UserRepository;
let AuditLogRepository;
let hashPassword;
let generateTotp;
let verifyTotp;

beforeAll(async () => {
  await startTestDb();
  app = require('../../app');
  env = require('../../config/env');
  UserRepository = require('../../repositories/UserRepository');
  AuditLogRepository = require('../../repositories/AuditLogRepository');
  ({ hashPassword } = require('../../utils/password'));
  ({ generateTotp, verifyTotp } = require('../../utils/totp'));
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const PASSWORD = 'Str0ng!Pass';
const GENERIC = 'Invalid or expired code';
let phoneSeq = 0;

async function makeUser(email, extra = {}) {
  phoneSeq += 1;
  return UserRepository.create({
    firstName: 'Mfa', lastName: 'User', fullName: 'Mfa User', email,
    phone: `0917777${String(phoneSeq).padStart(4, '0')}`,
    passwordHash: await hashPassword(PASSWORD),
    role: 'tenant', accountStatus: 'active',
    emergencyContact: { name: 'Ana Tenant', phone: '09171234598' },
    ...extra,
  });
}

const login = (email) => request(app).post('/api/auth/login').send({ email, password: PASSWORD });
const verify = (body) => request(app).post('/api/auth/verify-otp').send({ purpose: 'login_mfa', ...body });
const authed = (method, path, token) => request(app)[method](path).set('Authorization', `Bearer ${token}`);

const signAccessTokenFor = (user) => require('../../utils/jwt').signAccessToken(user);

/** The code an authenticator app shows `steps` 30-second steps from now. */
const codeAt = (secret, steps = 0) => generateTotp(secret, { nowMs: Date.now() + steps * 30000 });

/** A 6-digit code that is wrong for every step the server would accept right now. */
function wrongCode(secret) {
  for (let n = 0; ; n += 1) {
    const candidate = String(n).padStart(6, '0');
    if (verifyTotp(secret, candidate) === null) return candidate;
  }
}

/** Creates a user and turns on two-factor; the enable code uses the current step. */
async function enrolledUser(email) {
  await makeUser(email);
  const token = (await login(email)).body.data.accessToken;
  const setup = await authed('post', '/api/auth/mfa/setup', token).send({ password: PASSWORD });
  const { secret } = setup.body.data;
  const enableCode = codeAt(secret);
  const enable = await authed('post', '/api/auth/mfa/enable', token).send({ code: enableCode });
  return { token, secret, enableCode, backupCodes: enable.body.data.backupCodes };
}

describe('3.3 two-factor fields are hidden', () => {
  test('normal queries and API responses never include them; only the secrets loader does', async () => {
    const { token, secret } = await enrolledUser('hidden.fields@gmail.com');

    const plain = (await UserRepository.findByEmail('hidden.fields@gmail.com')).toObject();
    for (const field of ['secretEnc', 'pendingSecretEnc', 'lastUsedStep', 'backupCodeHashes', 'failedAttempts', 'lockedUntil']) {
      expect(plain.mfaTotp?.[field]).toBeUndefined();
    }
    const me = await authed('get', '/api/users/me', token);
    expect(me.body.data.user.mfaTotp).toBeUndefined();
    expect(me.body.data.user.mfaEnabled).toBe(true);

    const withSecrets = await UserRepository.findByEmail('hidden.fields@gmail.com', { withSecrets: true });
    expect(withSecrets.mfaTotp.secretEnc).toMatch(/^v1\./);
    expect(withSecrets.mfaTotp.secretEnc).not.toContain(secret);
    expect(withSecrets.mfaTotp.backupCodeHashes).toHaveLength(10);
  }, 30000);
});

describe('3.4 enrollment', () => {
  test('setup needs the password and returns an authenticator URI for Ledger OnBoard', async () => {
    await makeUser('setup.user@gmail.com');
    const token = (await login('setup.user@gmail.com')).body.data.accessToken;

    const wrongPassword = await authed('post', '/api/auth/mfa/setup', token).send({ password: 'Wrong1!Pass' });
    expect(wrongPassword.status).toBe(400);
    expect(wrongPassword.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

    const res = await authed('post', '/api/auth/mfa/setup', token).send({ password: PASSWORD });
    expect(res.status).toBe(200);
    const { otpauthUri, secret, issuer } = res.body.data;
    expect(issuer).toBe('Ledger OnBoard');
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri).toBe(
      `otpauth://totp/Ledger%20OnBoard:setup.user%40gmail.com?secret=${secret}&issuer=Ledger%20OnBoard&algorithm=SHA1&digits=6&period=30`
    );
    // Not on yet: setup alone changes nothing about sign-in.
    expect((await UserRepository.findByEmail('setup.user@gmail.com')).mfaEnabled).toBe(false);
  }, 30000);

  test('two-factor cannot be turned on without a correct code from the app', async () => {
    await makeUser('enable.user@gmail.com');
    const token = (await login('enable.user@gmail.com')).body.data.accessToken;

    const beforeSetup = await authed('post', '/api/auth/mfa/enable', token).send({ code: '123456' });
    expect(beforeSetup.status).toBe(400);
    expect(beforeSetup.body.error.code).toBe('MFA_SETUP_REQUIRED');

    const { secret } = (await authed('post', '/api/auth/mfa/setup', token).send({ password: PASSWORD })).body.data;

    const wrong = await authed('post', '/api/auth/mfa/enable', token).send({ code: wrongCode(secret) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });
    const backupStyle = await authed('post', '/api/auth/mfa/enable', token).send({ code: 'ABCDE-FGHJK' });
    expect(backupStyle.status).toBe(400);
    expect(backupStyle.body.error.code).toBe('VALIDATION_ERROR');
    expect((await UserRepository.findByEmail('enable.user@gmail.com')).mfaEnabled).toBe(false);

    const ok = await authed('post', '/api/auth/mfa/enable', token).send({ code: codeAt(secret) });
    expect(ok.status).toBe(200);
    const { backupCodes } = ok.body.data;
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);
    for (const code of backupCodes) expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    expect(ok.body.data.user).toMatchObject({ mfaEnabled: true, mfaMethod: 'totp' });
    expect(ok.body.data.user.mfaTotp).toBeUndefined();

    const again = await authed('post', '/api/auth/mfa/setup', token).send({ password: PASSWORD });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('MFA_ALREADY_ENABLED');
  }, 30000);

  test('the old email toggle (PATCH /api/auth/mfa) is gone', async () => {
    await makeUser('old.toggle@gmail.com');
    const token = (await login('old.toggle@gmail.com')).body.data.accessToken;
    const res = await authed('patch', '/api/auth/mfa', token).send({ enabled: true });
    expect(res.status).toBe(404);
    expect((await UserRepository.findByEmail('old.toggle@gmail.com')).mfaEnabled).toBe(false);
  }, 30000);

  test('without an encryption key, setup is unavailable rather than storing a secret in the clear', async () => {
    await makeUser('nokey.user@gmail.com');
    const token = (await login('nokey.user@gmail.com')).body.data.accessToken;
    const savedKey = env.mfaEncryptionKey;
    env.mfaEncryptionKey = null;
    try {
      const res = await authed('post', '/api/auth/mfa/setup', token).send({ password: PASSWORD });
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('MFA_NOT_CONFIGURED');
    } finally {
      env.mfaEncryptionKey = savedKey;
    }
    const stored = await UserRepository.findByEmail('nokey.user@gmail.com', { withSecrets: true });
    expect(stored.mfaTotp.pendingSecretEnc).toBeNull();
  }, 30000);
});

describe('3.5 the sign-in challenge', () => {
  test('a correct password returns only a challenge token, which with a code signs in', async () => {
    const { secret } = await enrolledUser('challenge.user@gmail.com');

    const first = await login('challenge.user@gmail.com');
    expect(first.status).toBe(200);
    expect(first.body.data).toEqual({ mfaRequired: true, challengeToken: expect.any(String) });

    const res = await verify({ challengeToken: first.body.data.challengeToken, code: codeAt(secret, 1) });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect((await authed('get', '/api/users/me', res.body.data.accessToken)).status).toBe(200);
  }, 30000);

  test('verify without a valid challenge token is rejected', async () => {
    const { token, secret } = await enrolledUser('nochallenge.user@gmail.com');
    const code = codeAt(secret, 1);

    const missing = await verify({ code });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');

    const garbage = await verify({ challengeToken: 'not-a-token', code });
    expect(garbage.status).toBe(401);
    expect(garbage.body.error.code).toBe('MFA_CHALLENGE_INVALID');

    // A sign-in token is not a challenge token.
    const signInToken = await verify({ challengeToken: token, code });
    expect(signInToken.status).toBe(401);
    expect(signInToken.body.error.code).toBe('MFA_CHALLENGE_INVALID');

    // Nor is an email-plus-code request in the old style.
    const oldStyle = await verify({ email: 'nochallenge.user@gmail.com', code });
    expect(oldStyle.status).toBe(400);
    expect(oldStyle.body.error.code).toBe('VALIDATION_ERROR');

    // The code was never spent on any of those, so it still works with a real challenge.
    const { challengeToken } = (await login('nochallenge.user@gmail.com')).body.data;
    expect((await verify({ challengeToken, code })).status).toBe(200);
  }, 30000);

  test('an expired challenge token is rejected', async () => {
    const { secret } = await enrolledUser('expired.challenge@gmail.com');
    const { challengeToken } = (await login('expired.challenge@gmail.com')).body.data;
    const realNow = Date.now;
    const later = realNow() + 6 * 60 * 1000;
    jest.spyOn(Date, 'now').mockImplementation(() => later);
    const res = await verify({ challengeToken, code: generateTotp(secret, { nowMs: later }) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MFA_CHALLENGE_INVALID');
  }, 30000);

  test('a challenge token does not work as a sign-in token', async () => {
    await enrolledUser('challenge.bearer@gmail.com');
    const { challengeToken } = (await login('challenge.bearer@gmail.com')).body.data;
    const res = await authed('get', '/api/users/me', challengeToken);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  }, 30000);

  test('a caretaker activation link token does not work as a sign-in token', async () => {
    const user = await makeUser('activation.bearer@gmail.com');
    const activationToken = jwt.sign({ sub: String(user._id), purpose: 'caretaker_activation' }, env.jwtSecret, { expiresIn: '3d' });
    const res = await authed('get', '/api/users/me', activationToken);
    expect(res.status).toBe(401);
  }, 30000);

  test('the activation page still works with its link token, and a sign-in token cannot stand in for it', async () => {
    const caretaker = await makeUser('activation.page@gmail.com', { role: 'caretaker', accountStatus: 'pending_activation', emergencyContact: undefined });
    // The same token the invitation email carries (AuthService.createCaretaker).
    const activationToken = jwt.sign({ sub: String(caretaker._id), purpose: 'caretaker_activation' }, env.jwtSecret, { expiresIn: '3d' });
    const { signAccessToken } = require('../../utils/jwt');

    const withSignInToken = await request(app).post('/api/auth/activate-caretaker').send({ token: signAccessToken(caretaker), password: 'NewStr0ng!Pass' });
    expect(withSignInToken.status).toBe(400);
    expect(withSignInToken.body.error.code).toBe('INVALID_ACTIVATION_TOKEN');

    const activated = await request(app).post('/api/auth/activate-caretaker').send({ token: activationToken, password: 'NewStr0ng!Pass' });
    expect(activated.status).toBe(200);
    const signIn = await request(app).post('/api/auth/login').send({ email: 'activation.page@gmail.com', password: 'NewStr0ng!Pass' });
    expect(signIn.status).toBe(200);
    expect(signIn.body.data.accessToken).toBeTruthy();
  }, 30000);
});

describe('3.6 limits and replay protection', () => {
  test('an authenticator code works only once', async () => {
    const { secret } = await enrolledUser('replay.user@gmail.com');
    const code = codeAt(secret, 1);

    const first = await login('replay.user@gmail.com');
    expect((await verify({ challengeToken: first.body.data.challengeToken, code })).status).toBe(200);

    const second = await login('replay.user@gmail.com');
    const replay = await verify({ challengeToken: second.body.data.challengeToken, code });
    expect(replay.status).toBe(400);
    expect(replay.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });
  }, 30000);

  test('the code used to turn two-factor on cannot be reused to sign in', async () => {
    const { enableCode } = await enrolledUser('enable.replay@gmail.com');
    const { challengeToken } = (await login('enable.replay@gmail.com')).body.data;
    // The enable step is spent; only a newer step is accepted.
    const res = await verify({ challengeToken, code: enableCode });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });
  }, 30000);

  test('backup codes work once each, in any case, with or without the dash', async () => {
    const { backupCodes } = await enrolledUser('backup.user@gmail.com');

    const first = await login('backup.user@gmail.com');
    const loose = backupCodes[0].toLowerCase().replace('-', '');
    expect((await verify({ challengeToken: first.body.data.challengeToken, code: loose })).status).toBe(200);

    const second = await login('backup.user@gmail.com');
    const spent = await verify({ challengeToken: second.body.data.challengeToken, code: backupCodes[0] });
    expect(spent.status).toBe(400);
    expect(spent.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });

    const stored = await UserRepository.findByEmail('backup.user@gmail.com', { withSecrets: true });
    expect(stored.mfaTotp.backupCodeHashes).toHaveLength(9);
    const used = await AuditLogRepository.findRecent({ action: 'MFA_BACKUP_CODE_USED' });
    expect(used.some((l) => String(l.targetId) === String(stored._id))).toBe(true);
  }, 30000);

  test('five wrong codes lock code entry (429), even for a correct code, with the same generic error before that', async () => {
    const { secret, backupCodes } = await enrolledUser('lockout.user@gmail.com');
    const { challengeToken } = (await login('lockout.user@gmail.com')).body.data;

    const wrongs = [wrongCode(secret), wrongCode(secret), 'ZZZZZ-ZZZZZ', wrongCode(secret), 'AAAAA-AAAAA'];
    for (const code of wrongs) {
      const res = await verify({ challengeToken, code });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'INVALID_OTP', message: GENERIC });
    }

    const locked = await verify({ challengeToken, code: codeAt(secret, 1) });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
    const lockedBackup = await verify({ challengeToken, code: backupCodes[0] });
    expect(lockedBackup.status).toBe(429);

    const user = await UserRepository.findByEmail('lockout.user@gmail.com');
    const lockLog = await AuditLogRepository.findRecent({ action: 'MFA_LOCKED' });
    expect(lockLog.some((l) => String(l.targetId) === String(user._id))).toBe(true);
  }, 30000);

  test('someone who knows only the email cannot touch the code counter or lock code entry', async () => {
    const { secret } = await enrolledUser('victim.user@gmail.com');
    const victim = await UserRepository.findByEmail('victim.user@gmail.com');
    const forgedSameSecret = jwt.sign({ sub: String(victim._id), purpose: 'mfa_pending' }, env.jwtSecret, { expiresIn: '5m' });
    const expiredChallenge = (() => {
      const realNow = Date.now;
      Date.now = () => realNow() - 10 * 60 * 1000;
      try {
        return require('../../utils/jwt').signMfaChallengeToken(victim);
      } finally {
        Date.now = realNow;
      }
    })();

    const attempts = [
      { email: 'victim.user@gmail.com', code: '000000' }, // old email-plus-code style
      { challengeToken: 'not-a-token', code: '000000' },
      { challengeToken: forgedSameSecret, code: '000000' }, // challenge claim, wrong key
      { challengeToken: expiredChallenge, code: '000000' },
      { challengeToken: signAccessTokenFor(victim), code: '000000' }, // a sign-in token is not a challenge
    ];
    for (let round = 0; round < 3; round += 1) {
      for (const body of attempts) {
        const res = await verify(body);
        expect([400, 401]).toContain(res.status);
        expect(res.body.error.code).not.toBe('INVALID_OTP'); // never reached the code check
      }
    }

    const stored = await UserRepository.findByEmail('victim.user@gmail.com', { withSecrets: true });
    expect(stored.mfaTotp.failedAttempts).toBe(0);
    expect(stored.mfaTotp.lockedUntil).toBeNull();

    // The real person, with the password, still signs in normally.
    const { challengeToken } = (await login('victim.user@gmail.com')).body.data;
    expect((await verify({ challengeToken, code: codeAt(secret, 1) })).status).toBe(200);
  }, 30000);

  test('a wrong password on disable or backup-code renewal does not count as a wrong code', async () => {
    const { token, backupCodes } = await enrolledUser('password.first@gmail.com');
    for (let i = 0; i < 6; i += 1) {
      expect((await authed('post', '/api/auth/mfa/disable', token).send({ password: 'Wrong1!Pass', code: '000000' })).body.error.code).toBe('INVALID_CURRENT_PASSWORD');
      expect((await authed('post', '/api/auth/mfa/recovery-codes', token).send({ password: 'Wrong1!Pass', code: '000000' })).body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    }
    const stored = await UserRepository.findByEmail('password.first@gmail.com', { withSecrets: true });
    expect(stored.mfaTotp.failedAttempts).toBe(0);
    expect((await authed('post', '/api/auth/mfa/disable', token).send({ password: PASSWORD, code: backupCodes[0] })).status).toBe(200);
  }, 30000);
});

describe('turning two-factor off and replacing backup codes', () => {
  test('disable needs the password and a valid code, then sign-in needs only the password', async () => {
    const { token, secret, backupCodes } = await enrolledUser('disable.user@gmail.com');

    const wrongPassword = await authed('post', '/api/auth/mfa/disable', token).send({ password: 'Wrong1!Pass', code: backupCodes[0] });
    expect(wrongPassword.status).toBe(400);
    expect(wrongPassword.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    const wrong = await authed('post', '/api/auth/mfa/disable', token).send({ password: PASSWORD, code: wrongCode(secret) });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.message).toBe(GENERIC);
    const noCode = await authed('post', '/api/auth/mfa/disable', token).send({ password: PASSWORD });
    expect(noCode.status).toBe(400);
    expect(noCode.body.error.message).toBe(GENERIC);

    const ok = await authed('post', '/api/auth/mfa/disable', token).send({ password: PASSWORD, code: backupCodes[1] });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user).toMatchObject({ mfaEnabled: false, mfaMethod: 'none' });

    const stored = await UserRepository.findByEmail('disable.user@gmail.com', { withSecrets: true });
    expect(stored.mfaTotp.secretEnc).toBeNull();
    expect(stored.mfaTotp.backupCodeHashes).toHaveLength(0);
    const res = await login('disable.user@gmail.com');
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.mfaRequired).toBeUndefined();
  }, 30000);

  test('new backup codes replace the old ones', async () => {
    const { token, backupCodes: oldCodes } = await enrolledUser('regen.user@gmail.com');

    const res = await authed('post', '/api/auth/mfa/recovery-codes', token).send({ password: PASSWORD, code: oldCodes[0] });
    expect(res.status).toBe(200);
    const newCodes = res.body.data.backupCodes;
    expect(newCodes).toHaveLength(10);
    expect(newCodes.some((c) => oldCodes.includes(c))).toBe(false);

    const first = await login('regen.user@gmail.com');
    expect((await verify({ challengeToken: first.body.data.challengeToken, code: oldCodes[1] })).status).toBe(400);
    const second = await login('regen.user@gmail.com');
    expect((await verify({ challengeToken: second.body.data.challengeToken, code: newCodes[0] })).status).toBe(200);
  }, 30000);
});

describe('3.7 the retired email two-factor', () => {
  test('an account with email two-factor switched on signs in with just its password', async () => {
    await makeUser('old.email.mfa@gmail.com', { mfaEnabled: true, mfaMethod: 'email' });
    const res = await login('old.email.mfa@gmail.com');
    expect(res.status).toBe(200);
    expect(res.body.data.mfaRequired).toBeUndefined();
    expect(res.body.data.accessToken).toBeTruthy();
  }, 30000);

  test('it can be switched off with just the password', async () => {
    await makeUser('old.email.off@gmail.com', { mfaEnabled: true, mfaMethod: 'email' });
    const token = (await login('old.email.off@gmail.com')).body.data.accessToken;
    const res = await authed('post', '/api/auth/mfa/disable', token).send({ password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ mfaEnabled: false, mfaMethod: 'none' });
  }, 30000);
});

describe('secrets never leak', () => {
  test('no secret or backup code reaches the logs or the audit trail', async () => {
    const logged = [];
    for (const level of ['log', 'info', 'warn', 'error']) {
      jest.spyOn(console, level).mockImplementation((...args) => logged.push(args.map(String).join(' ')));
    }
    const { secret, backupCodes } = await enrolledUser('no.leaks@gmail.com');
    const { challengeToken } = (await login('no.leaks@gmail.com')).body.data;
    await verify({ challengeToken, code: backupCodes[0] });

    const user = await UserRepository.findByEmail('no.leaks@gmail.com');
    const audit = (await AuditLogRepository.findRecent({ limit: 500 })).filter((l) => String(l.targetId) === String(user._id) || String(l.actorId) === String(user._id));
    expect(audit.map((l) => l.action)).toEqual(expect.arrayContaining(['MFA_ENABLED', 'MFA_BACKUP_CODE_USED']));
    const everything = [...logged, ...audit.map((l) => JSON.stringify(l))].join('\n');
    expect(everything).not.toContain(secret);
    for (const code of backupCodes) {
      expect(everything).not.toContain(code);
      expect(everything).not.toContain(code.replace('-', ''));
    }
  }, 30000);
});
