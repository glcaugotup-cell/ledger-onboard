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

  it.each(['tenant', 'landlord', 'caretaker'])('X2: the %s’s email and role are read-only text, and their name is editable', (role) => {
    renderPage(USERS[role]);
    const info = screen.getByText('Email').closest('dl');
    expect(within(info).getByText(USERS[role].email)).toBeInTheDocument();
    expect(within(info).getByText(role[0].toUpperCase() + role.slice(1))).toBeInTheDocument();
    // Email and role are never inputs.
    expect(screen.queryByDisplayValue(USERS[role].email)).not.toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toBeInTheDocument();
    expect(screen.getByLabelText('Last name')).toBeInTheDocument();
    expect(screen.getByLabelText('Emergency contact name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a code/i })).toBeInTheDocument();
  });

  it('the admin profile is unchanged: registered name and email are read-only text', () => {
    renderPage(USERS.admin);
    const info = screen.getByText('Full name').closest('dl');
    expect(within(info).getByText(USERS.admin.fullName)).toBeInTheDocument();
    expect(within(info).getByText(USERS.admin.email)).toBeInTheDocument();
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/last name/i)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(USERS.admin.email)).not.toBeInTheDocument();
  });

  it('shows role-specific details', () => {
    renderPage(USERS.caretaker);
    expect(screen.getByText('Bonuan Gueset')).toBeInTheDocument();
  });

  it('admin: saves only the phone number', async () => {
    AuthApi.updateMe.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage(USERS.admin);
    // The +63 badge is aria-hidden, so the field's accessible name is just "Phone".
    const phone = screen.getByRole('textbox', { name: 'Phone' });
    await user.clear(phone);
    await user.type(phone, '09991234567');
    await user.click(screen.getByRole('button', { name: /save phone number/i }));
    await waitFor(() => expect(AuthApi.updateMe).toHaveBeenCalledWith({ phone: '09991234567' }));
    expect(await screen.findByText('Phone number updated.')).toBeInTheDocument();
  });

  it('rejects an invalid phone number before sending', async () => {
    const user = userEvent.setup();
    renderPage();
    const phone = screen.getByRole('textbox', { name: 'Phone' });
    await user.clear(phone);
    await user.type(phone, '123');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(AuthApi.updateMe).not.toHaveBeenCalled();
    expect(screen.getByText(/must be 09xxxxxxxxx/i)).toBeInTheDocument();
  });

  it('X2: saves name, phone and emergency contact (names auto-capitalized); never sends email or role', async () => {
    AuthApi.updateMe.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    const first = screen.getByLabelText('First name');
    await user.clear(first);
    await user.type(first, 'maria');
    const emergency = screen.getByLabelText('Emergency contact name');
    await user.clear(emergency);
    await user.type(emergency, "pedro o'neil");
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(AuthApi.updateMe).toHaveBeenCalledWith({
      firstName: 'Maria',
      lastName: "O'Connor",
      phone: '09171234567',
      emergencyContact: { name: "Pedro O'Neil", phone: '09181234567' },
    }));
    const sent = AuthApi.updateMe.mock.calls[0][0];
    expect(sent).not.toHaveProperty('email');
    expect(sent).not.toHaveProperty('role');
    expect(await screen.findByText('Your details were updated.')).toBeInTheDocument();
  });

  it('X2: rejects an invalid name before sending', async () => {
    const user = userEvent.setup();
    renderPage();
    const last = screen.getByLabelText('Last name');
    await user.clear(last);
    await user.type(last, 'x');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(AuthApi.updateMe).not.toHaveBeenCalled();
    expect(screen.getByText(/min 2 characters/i)).toBeInTheDocument();
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
    const confirm = within(screen.getByRole('dialog')).getByRole('button', { name: /yes, delete my account/i });
    // A reason (3+ characters) is required before the account can be closed.
    expect(confirm).toBeDisabled();
    await user.type(within(screen.getByRole('dialog')).getByLabelText(/why are you leaving/i), 'Moving away');
    await user.click(confirm);
    await waitFor(() => expect(AuthApi.deactivateAccount).toHaveBeenCalledWith('Moving away'));
    expect(AuthApi.deactivateAccount).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it('shows why a landlord’s account can’t be closed yet and keeps them signed in', async () => {
    AuthApi.deactivateAccount.mockRejectedValue(Object.assign(new Error('You still have 1 pending or current reservation.'), { code: 'LANDLORD_HAS_OPEN_RESERVATIONS' }));
    const user = userEvent.setup();
    const { logout } = renderPage(USERS.landlord);
    await user.click(screen.getByRole('button', { name: /delete account/i }));
    await user.type(within(screen.getByRole('dialog')).getByLabelText(/why are you leaving/i), 'Selling the property');
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
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/why are you leaving/i), 'Graduated');
    await user.click(within(dialog).getByRole('button', { name: /yes, delete my account/i }));
    await waitFor(() => expect(AuthApi.deactivateAccount).toHaveBeenCalledWith('Graduated'));
  });

  it('toggles email-code sign-in', async () => {
    AuthApi.setMfaPreference.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /turn on/i }));
    expect(AuthApi.setMfaPreference).toHaveBeenCalledWith(true);
  });
});
