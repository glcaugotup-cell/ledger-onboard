// User rule (2026-10-16): only students with a current, admin-approved school ID may reserve.
// Tests that are about something else start their tenants as verified students with these fields;
// studentVerification.test.js covers how a student actually gets verified.
const VERIFIED_STUDENT = Object.freeze({
  studentVerificationStatus: 'VERIFIED',
  studentSchool: 'PHINMA University of Pangasinan',
  studentIdValidUntilYear: new Date().getFullYear() + 2,
});

/** For tenants registered through the API: marks them as verified students. */
async function markVerifiedStudent(userId) {
  const UserRepository = require('../../repositories/UserRepository');
  await UserRepository.updateById(userId, VERIFIED_STUDENT);
}

module.exports = { VERIFIED_STUDENT, markVerifiedStudent };
