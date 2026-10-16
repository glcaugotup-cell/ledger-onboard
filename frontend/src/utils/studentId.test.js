import { describe, expect, it } from 'vitest';
import { isStudentIdYearCurrent, reserveBlockedReason, studentIdState } from './studentId.js';

// User rule (2026-10-16): an ID printed "2024–2028" counts until May 31, 2028 (Manila time).
describe('student ID validity', () => {
  it('counts through May 31 of the last year in Manila and stops at June 1', () => {
    expect(isStudentIdYearCurrent(2028, new Date('2028-05-31T23:59:59+08:00'))).toBe(true);
    expect(isStudentIdYearCurrent(2028, new Date('2028-06-01T00:00:00+08:00'))).toBe(false);
    expect(isStudentIdYearCurrent(undefined)).toBe(false);
  });

  it('turns a verified ID into EXPIRED after that day, and passes other statuses through', () => {
    const verified = { studentVerificationStatus: 'VERIFIED', studentIdValidUntilYear: 2028 };
    expect(studentIdState(verified, new Date('2028-05-01T00:00:00+08:00'))).toBe('VERIFIED');
    expect(studentIdState(verified, new Date('2028-06-02T00:00:00+08:00'))).toBe('EXPIRED');
    expect(studentIdState({ studentVerificationStatus: 'PENDING' })).toBe('PENDING');
    expect(studentIdState({ studentVerificationStatus: 'REJECTED' })).toBe('REJECTED');
    expect(studentIdState({})).toBe('NONE');
    expect(studentIdState(null)).toBe('NONE');
  });

  it('explains why a student cannot reserve, with the same words as the server', () => {
    const now = new Date('2028-07-01T00:00:00+08:00');
    expect(reserveBlockedReason({ studentVerificationStatus: 'VERIFIED', studentIdValidUntilYear: 2030 }, now)).toBe('');
    expect(reserveBlockedReason({ studentVerificationStatus: 'VERIFIED', studentIdValidUntilYear: 2028 }, now))
      .toBe('Your student ID was valid until May 31, 2028. Upload your current school ID to reserve.');
    expect(reserveBlockedReason({ studentVerificationStatus: 'PENDING' }, now)).toBe('Your student ID is still being reviewed. You can reserve once an admin approves it.');
    expect(reserveBlockedReason({ studentVerificationStatus: 'REJECTED' }, now)).toBe('Your student ID was not approved. Upload it again under Student verification to reserve.');
    expect(reserveBlockedReason({}, now)).toBe('Verify your student ID before reserving a room.');
  });
});
