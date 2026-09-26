import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './ProfilePage.jsx';
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
  default: { updateMe: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn(), setMfaPreference: vi.fn(), deactivateAccount: vi.fn() },
}));
vi.mock('../../services/ReviewApi.js', () => ({ default: { listEligible: vi.fn(), submit: vi.fn() } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const USERS = {
  tenant: {
    _id: 't1', role: 'tenant', firstName: 'Juan', lastName: "O'Connor", fullName: "Juan O'Connor", phone: '09171234567', email: 'juan@gmail.com',
    mfaEnabled: false, emergencyContact: { name: 'Ana Cruz', phone: '09181234567' }, createdAt: '2026-01-05T00:00:00Z',
  },
  landlord: { _id: 'l1', role: 'landlord', fullName: 'Lara Landlord', email: 'lara@gmail.com', phone: '09170000001', businessVerificationStatus: 'VERIFIED' },
  caretaker: { _id: 'c1', role: 'caretaker', fullName: 'Carlo Caretaker', email: 'carlo@gmail.com', phone: '09170000002', serviceBarangay: 'Bonuan Gueset' },
  admin: { _id: 'a1', role: 'admin', fullName: 'Ada Admin', email: 'ada@gmail.com', phone: '09170000003' },
};

function renderPage(user = USERS.tenant) {
  const refreshProfile = vi.fn().mockResolvedValue(user);
  const logout = vi.fn().mockResolvedValue(undefined);
  useAuthMock.mockReturnValue(mockAuthValue({ user, refreshProfile, logout }));
  useNotificationsMock.mockReturnValue(mockNotificationsValue());
  render(
    <MemoryRouter>
      <ProfilePage />
    </MemoryRouter>
  );
  return { refreshProfile, logout };
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['tenant', 'landlord', 'caretaker', 'admin'])('shows the %s’s registered name and email as read-only text', (role) => {
    renderPage(USERS[role]);
    const info = screen.getByText('Full name').closest('dl');
    expect(within(info).getByText(USERS[role].fullName)).toBeInTheDocument();
    expect(within(info).getByText(USERS[role].email)).toBeInTheDocument();
    // No editable inputs for identity fields.
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/last name/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(USERS[role].email)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
  });

  it('shows role-specific details', () => {
    renderPage(USERS.caretaker);
    expect(screen.getByText('Bonuan Gueset')).toBeInTheDocument();
  });

  it('saves only the phone number', async () => {
    AuthApi.updateMe.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    const phone = screen.getByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '09991234567');
    await user.click(screen.getByRole('button', { name: /save phone number/i }));
    await waitFor(() => expect(AuthApi.updateMe).toHaveBeenCalledWith({ phone: '09991234567' }));
    expect(await screen.findByText('Phone number updated.')).toBeInTheDocument();
  });

  it('rejects an invalid phone number before sending', async () => {
    const user = userEvent.setup();
    renderPage();
    const phone = screen.getByLabelText('Phone');
    await user.clear(phone);
    await user.type(phone, '123');
    await user.click(screen.getByRole('button', { name: /save phone number/i }));
    expect(AuthApi.updateMe).not.toHaveBeenCalled();
    expect(screen.getByText(/must be 09xxxxxxxxx/i)).toBeInTheDocument();
  });

  it('changes the password with a code emailed to the registered address, then signs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    AuthApi.forgotPassword.mockResolvedValue({});
    AuthApi.resetPassword.mockResolvedValue({});
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { logout } = renderPage();

    await user.click(screen.getByRole('button', { name: /email me a code/i }));
    expect(AuthApi.forgotPassword).toHaveBeenCalledWith({ email: 'juan@gmail.com' });

    await user.type(await screen.findByLabelText('Code from the email'), '123456');
    await user.type(screen.getByLabelText('New password'), 'N3w!Password');
    await user.type(screen.getByLabelText('Confirm password'), 'N3w!Password');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(AuthApi.resetPassword).toHaveBeenCalledWith({ email: 'juan@gmail.com', code: '123456', newPassword: 'N3w!Password' }));
    vi.advanceTimersByTime(1600);
    await waitFor(() => expect(logout).toHaveBeenCalled());
    vi.useRealTimers();
  });

  it('refuses a new password containing a space', async () => {
    AuthApi.forgotPassword.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /email me a code/i }));
    await user.type(await screen.findByLabelText('Code from the email'), '123456');
    await user.type(screen.getByLabelText('New password'), 'N3w Password!');
    // Immediate feedback under the field...
    expect(screen.getAllByText('Password must not contain spaces.').length).toBeGreaterThan(0);
    await user.type(screen.getByLabelText('Confirm password'), 'N3w Password!');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    // ...and the request is never sent.
    expect(AuthApi.resetPassword).not.toHaveBeenCalled();
  });

  it('admins have no delete-account option', () => {
    renderPage(USERS.admin);
    expect(screen.queryByRole('button', { name: /delete account/i })).not.toBeInTheDocument();
  });

  it.each(['landlord', 'caretaker'])('a %s must confirm in the dialog; Cancel leaves the account alone', async (role) => {
    AuthApi.deactivateAccount.mockResolvedValue({});
    const user = userEvent.setup();
    const { logout } = renderPage(USERS[role]);

    await user.click(screen.getByRole('button', { name: /delete account/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/kept/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(AuthApi.deactivateAccount).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /delete account/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /yes, delete my account/i }));
    await waitFor(() => expect(AuthApi.deactivateAccount).toHaveBeenCalledTimes(1));
    expect(logout).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('shows why a landlord’s account can’t be closed yet and keeps them signed in', async () => {
    AuthApi.deactivateAccount.mockRejectedValue(Object.assign(new Error('You still have 1 pending or current reservation.'), { code: 'LANDLORD_HAS_OPEN_RESERVATIONS' }));
    const user = userEvent.setup();
    const { logout } = renderPage(USERS.landlord);
    await user.click(screen.getByRole('button', { name: /delete account/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /yes, delete my account/i }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/pending or current reservation/);
    expect(logout).not.toHaveBeenCalled();
  });

  it('tenant: goes through the existing unregister flow — review prompt first when eligible', async () => {
    ReviewApi.listEligible.mockResolvedValue({ eligibleReservations: [{ _id: 'r1', propertyId: { _id: 'p1', propertyName: 'Sunshine' } }] });
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /delete account/i }));
    expect(await screen.findByText(/haven't reviewed/i)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /skip review & continue/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('tenant with nothing to review goes straight to the confirmation dialog', async () => {
    ReviewApi.listEligible.mockResolvedValue({ eligibleReservations: [] });
    AuthApi.deactivateAccount.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /delete account/i }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /yes, delete my account/i }));
    await waitFor(() => expect(AuthApi.deactivateAccount).toHaveBeenCalled());
  });

  it('toggles email-code sign-in', async () => {
    AuthApi.setMfaPreference.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /turn on/i }));
    expect(AuthApi.setMfaPreference).toHaveBeenCalledWith(true);
  });
});
