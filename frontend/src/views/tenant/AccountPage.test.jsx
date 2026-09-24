import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountPage from './AccountPage.jsx';
import AuthApi from '../../services/AuthApi.js';
import ReviewApi from '../../services/ReviewApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock, navigateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useNotificationsMock: vi.fn(),
  navigateMock: vi.fn(),
}));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/AuthApi.js', () => ({
  default: { updateMe: vi.fn(), changePassword: vi.fn(), setMfaPreference: vi.fn(), deactivateAccount: vi.fn() },
}));
vi.mock('../../services/ReviewApi.js', () => ({ default: { listEligible: vi.fn(), submit: vi.fn() } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const baseUser = { _id: 't1', firstName: 'Juan', lastName: 'Dela Cruz', phone: '09171234567', email: 'juan@gmail.com', role: 'tenant', mfaEnabled: false };

function renderPage(user = baseUser) {
  const refreshProfile = vi.fn().mockResolvedValue(user);
  const logout = vi.fn().mockResolvedValue(undefined);
  useAuthMock.mockReturnValue(mockAuthValue({ user, refreshProfile, logout }));
  useNotificationsMock.mockReturnValue(mockNotificationsValue());
  render(
    <MemoryRouter>
      <AccountPage />
    </MemoryRouter>
  );
  return { refreshProfile, logout };
}

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pre-fills the profile form from the current user', () => {
    renderPage();
    expect(screen.getByLabelText('First name')).toHaveValue('Juan');
    expect(screen.getByLabelText('Last name')).toHaveValue('Dela Cruz');
    expect(screen.getByLabelText('Phone')).toHaveValue('09171234567');
  });

  it('blocks profile submission and shows validation errors for bad values', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.clear(screen.getByLabelText('First name'));
    await user.type(screen.getByLabelText('First name'), 'juan');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(AuthApi.updateMe).not.toHaveBeenCalled();
    expect(await screen.findByText(/must start with an uppercase letter/i)).toBeInTheDocument();
  });

  it('saves a valid profile update', async () => {
    AuthApi.updateMe.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(AuthApi.updateMe).toHaveBeenCalledWith({ firstName: 'Juan', lastName: 'Dela Cruz', phone: '09171234567' });
    });
    expect(await screen.findByText('Profile updated.')).toBeInTheDocument();
  });

  it('changes the password and signs the user out', async () => {
    AuthApi.changePassword.mockResolvedValue({});
    const user = userEvent.setup();
    const { logout } = renderPage();

    await user.type(screen.getByLabelText('Current password'), 'OldPass1!');
    await user.type(screen.getByLabelText(/^new password/i), 'NewStr0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'NewStr0ng!Pass');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => {
      expect(AuthApi.changePassword).toHaveBeenCalledWith({ currentPassword: 'OldPass1!', newPassword: 'NewStr0ng!Pass' });
    });
    expect(await screen.findByText(/please sign in again/i)).toBeInTheDocument();

    // The page waits ~1.5s before signing out; poll with real timers rather
    // than faking them, since fake timers don't mix well with userEvent's
    // own internal delays.
    await waitFor(() => expect(logout).toHaveBeenCalled(), { timeout: 3000 });
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('toggles MFA on', async () => {
    AuthApi.setMfaPreference.mockResolvedValue({ user: { ...baseUser, mfaEnabled: true } });
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText(/is off/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /turn on/i }));

    await waitFor(() => {
      expect(AuthApi.setMfaPreference).toHaveBeenCalledWith(true);
    });
  });

  it('skips straight to the confirm step when the tenant has no eligible reviews', async () => {
    ReviewApi.listEligible.mockResolvedValue({ eligibleReservations: [] });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /unregister my account/i }));

    expect(await screen.findByText(/this will deactivate your account/i)).toBeInTheDocument();
  });

  it('shows the review prompt when the tenant has eligible reservations', async () => {
    ReviewApi.listEligible.mockResolvedValue({
      eligibleReservations: [{ _id: 'res1', propertyId: { _id: 'p1', propertyName: 'Dagupan Demo Boarding House' } }],
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /unregister my account/i }));

    expect(await screen.findByText(/you haven.t reviewed yet/i)).toBeInTheDocument();
    expect(screen.getByText('Dagupan Demo Boarding House')).toBeInTheDocument();
  });

  it('finalizes account deactivation and navigates to the landing page', async () => {
    ReviewApi.listEligible.mockResolvedValue({ eligibleReservations: [] });
    AuthApi.deactivateAccount.mockResolvedValue({});
    const user = userEvent.setup();
    const { logout } = renderPage();

    await user.click(screen.getByRole('button', { name: /unregister my account/i }));
    await user.click(await screen.findByRole('button', { name: /yes, deactivate my account/i }));

    await waitFor(() => {
      expect(AuthApi.deactivateAccount).toHaveBeenCalled();
      expect(logout).toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/');
    });
  });
});
