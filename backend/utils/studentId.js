const ApiError = require('./ApiError');
const { VERIFICATION_STATUS } = require('./constants');

/**
 * Student ID validity. An ID printed "2024–2028" counts until May 31 of its last year (the end
 * of that school year here), in Manila time, so it stops counting at 00:00 on June 1.
 */
function studentIdExpiresAt(validUntilYear) {
  return new Date(`${String(validUntilYear).padStart(4, '0')}-06-01T00:00:00+08:00`);
}

function isStudentIdYearCurrent(validUntilYear, now = new Date()) {
  return Number.isInteger(validUntilYear) && now < studentIdExpiresAt(validUntilYear);
}

/** 'VERIFIED' | 'EXPIRED' | 'PENDING' | 'REJECTED' | 'NONE', from the user's mirrored fields. */
function studentIdState(user, now = new Date()) {
  const status = user?.studentVerificationStatus;
  if (status === VERIFICATION_STATUS.VERIFIED) {
    return isStudentIdYearCurrent(user.studentIdValidUntilYear, now) ? 'VERIFIED' : 'EXPIRED';
  }
  return status || 'NONE';
}

const lastValidDay = (year) => `May 31, ${year}`;

const NOT_VERIFIED_MESSAGES = {
  PENDING: () => 'Your student ID is still being reviewed. You can reserve once an admin approves it.',
  EXPIRED: (user) => `Your student ID was valid until ${lastValidDay(user.studentIdValidUntilYear)}. Upload your current school ID to reserve.`,
  REJECTED: () => 'Your student ID was not approved. Upload it again under Student verification to reserve.',
  NONE: () => 'Verify your student ID before reserving a room.',
};

/** Only students with a current, approved school ID may reserve. */
function assertStudentCanReserve(user, now = new Date()) {
  const state = studentIdState(user, now);
  if (state === 'VERIFIED') return;
  throw ApiError.forbidden((NOT_VERIFIED_MESSAGES[state] || NOT_VERIFIED_MESSAGES.NONE)(user), 'STUDENT_NOT_VERIFIED');
}

module.exports = { studentIdExpiresAt, isStudentIdYearCurrent, studentIdState, assertStudentCanReserve, lastValidDay };
