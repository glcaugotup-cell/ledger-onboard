/**
 * Student ID validity, the same rule as the backend (backend/utils/studentId.js): an ID printed
 * "2024–2028" counts until May 31 of its last year, Manila time, and stops at 00:00 on June 1.
 */
export const lastValidDay = (year) => `May 31, ${year}`;

export function studentIdExpiresAt(validUntilYear) {
  return new Date(`${String(validUntilYear).padStart(4, '0')}-06-01T00:00:00+08:00`);
}

export function isStudentIdYearCurrent(validUntilYear, now = new Date()) {
  return Number.isInteger(validUntilYear) && now < studentIdExpiresAt(validUntilYear);
}

/** 'VERIFIED' | 'EXPIRED' | 'PENDING' | 'REJECTED' | 'NONE', from a user's (or a reservation tenant's) fields. */
export function studentIdState(user, now = new Date()) {
  const status = user?.studentVerificationStatus;
  if (status === 'VERIFIED') return isStudentIdYearCurrent(user.studentIdValidUntilYear, now) ? 'VERIFIED' : 'EXPIRED';
  return status || 'NONE';
}

/** Why a student can't reserve yet, matching the backend's messages; '' when they can. */
export function reserveBlockedReason(user, now = new Date()) {
  switch (studentIdState(user, now)) {
    case 'VERIFIED': return '';
    case 'PENDING': return 'Your student ID is still being reviewed. You can reserve once an admin approves it.';
    case 'EXPIRED': return `Your student ID was valid until ${lastValidDay(user.studentIdValidUntilYear)}. Upload your current school ID to reserve.`;
    case 'REJECTED': return 'Your student ID was not approved. Upload it again under Student verification to reserve.';
    default: return 'Verify your student ID before reserving a room.';
  }
}
