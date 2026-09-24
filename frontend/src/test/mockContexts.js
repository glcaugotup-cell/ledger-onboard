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
    logout: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn(),
    ...overrides,
  };
}

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
