// Runs before every Jest test file (see "setupFiles" in package.json), before any app module loads.
// Password hashing at the production cost (12) makes fixture-heavy tests exceed Jest's 5 s limit on
// slower machines; tests never need strong hashes. config/env.js refuses a cost below 10 in production.
process.env.BCRYPT_SALT_ROUNDS = '4';
