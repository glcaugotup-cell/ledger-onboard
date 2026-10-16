import { vi } from 'vitest';

/** Default shape for a mocked useAuth() return value; override per test. */
export function mockAuthValue(overrides = {}) {
  return {
    user: { _id: 'u1', id: 'u1', fullName: 'Demo User', role: 'tenant' },
    status: 'authenticated',
    mfaChallenge: null,
    register: vi.fn(),
    login: vi.fn(),
    verifyLoginOtp: vi.fn(),
    cancelMfaChallenge: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn(),
    ...overrides,
  };
}

// User rule (2026-10-16): only students with a current, admin-approved school ID can reserve.
// Spread into a tenant user in tests that are about something else.
export const VERIFIED_STUDENT_FIELDS = Object.freeze({
  studentVerificationStatus: 'VERIFIED',
  studentSchool: 'PHINMA University of Pangasinan',
  studentIdValidUntilYear: new Date().getFullYear() + 2,
});

/** Default shape for a mocked useNotifications() return value; override per test. */
export function mockNotificationsValue(overrides = {}) {
  return {
    notifications: [],
    unreadCount: 0,
    refresh: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    ...overrides,
  };
}
