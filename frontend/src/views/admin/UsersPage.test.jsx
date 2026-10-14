import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UsersPage from './UsersPage.jsx';
import AdminApi from '../../services/AdminApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/AdminApi.js', () => ({ default: { listUsers: vi.fn(), setUserStatus: vi.fn(), deactivateInactive: vi.fn(), issueResetCode: vi.fn(), createAdmin: vi.fn(), archiveUser: vi.fn(), restoreUser: vi.fn(), deleteUser: vi.fn() } }));

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

const users = {
  users: [
    { _id: 'u1', fullName: 'Juan Tenant', role: 'tenant', email: 'juan@gmail.com', accountStatus: 'active', lastLoginAt: ago(60 * 1000), lastActivityAt: ago(60 * 1000) },
    {
      _id: 'u2', fullName: 'Ana Landlord', role: 'landlord', email: 'ana@gmail.com', accountStatus: 'suspended', statusReason: 'Policy violation',
      lastLoginAt: ago(DAY_MS), lastActivityAt: ago(DAY_MS),
    },
    { _id: 'u3', fullName: 'Old Caretaker', role: 'caretaker', email: 'old@gmail.com', accountStatus: 'active', lastLoginAt: ago(70 * DAY_MS), lastActivityAt: ago(70 * DAY_MS) },
    { _id: 'u4', fullName: 'New Invitee', role: 'caretaker', email: 'new@gmail.com', accountStatus: 'pending_activation', lastLoginAt: null, lastActivityAt: ago(2 * DAY_MS) },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>
  );
}

const cardOf = (name) => screen.getByText(name).closest('div.rounded-xl');

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'a1', fullName: 'Admin Cruz', role: 'admin' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    AdminApi.listUsers.mockResolvedValue(users);
  });

  it('lists users with their role, status badge, saved reason and activity', async () => {
    renderPage();
    expect(await screen.findByText('Juan Tenant')).toBeInTheDocument();
    expect(within(cardOf('Juan Tenant')).getByText('Active now')).toBeInTheDocument();
    expect(within(cardOf('Ana Landlord')).getByText('Active 1 day ago')).toBeInTheDocument();
    expect(within(cardOf('Ana Landlord')).getByText('Suspended')).toBeInTheDocument();
    expect(within(cardOf('Ana Landlord')).getByText('Reason: Policy violation')).toBeInTheDocument();
    expect(within(cardOf('Old Caretaker')).getByText('Active 2 months ago')).toBeInTheDocument();
    expect(within(cardOf('New Invitee')).getByText('Never active')).toBeInTheDocument();
    // Activity never replaces the account status.
    expect(within(cardOf('New Invitee')).getByText('Pending activation')).toBeInTheDocument();
  });

  it('re-fetches with the selected role filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');
    await user.selectOptions(screen.getByRole('combobox', { name: /filter by role/i }), 'landlord');
    await waitFor(() => expect(AdminApi.listUsers).toHaveBeenLastCalledWith({ role: 'landlord' }));
  });

  it('Cancel on the suspension dialog does not suspend', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');

    await user.click(within(cardOf('Juan Tenant')).getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('Policy violation'));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(AdminApi.setUserStatus).not.toHaveBeenCalled();
  });

  it('suspends only after a reason is chosen and the admin confirms, then shows a success message', async () => {
    AdminApi.setUserStatus.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');

    await user.click(within(cardOf('Juan Tenant')).getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog');
    // The standard reasons are offered, plus Other.
    for (const reason of ['Policy violation', 'Suspicious activity', 'Incomplete/invalid information', 'Repeated rule violations', 'Administrative review', 'Other']) {
      expect(within(dialog).getByLabelText(reason)).toBeInTheDocument();
    }

    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));
    expect(within(dialog).getByText('Select at least one reason.')).toBeInTheDocument();
    expect(AdminApi.setUserStatus).not.toHaveBeenCalled();

    await user.click(within(dialog).getByLabelText('Suspicious activity'));
    await user.click(within(dialog).getByLabelText('Other'));
    await user.type(within(dialog).getByLabelText('Other reason'), 'fake listing photos');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend account' }));

    await waitFor(() =>
      expect(AdminApi.setUserStatus).toHaveBeenCalledWith('u1', { status: 'suspended', reason: 'Suspicious activity; Other: Fake listing photos' })
    );
    expect(await screen.findByText('Juan Tenant has been suspended.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the dialog open with the server error if suspension fails', async () => {
    AdminApi.setUserStatus.mockRejectedValue(new Error('Admin accounts cannot be modified'));
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');
    await user.click(within(cardOf('Juan Tenant')).getByRole('button', { name: 'Suspend' }));
    await user.click(within(screen.getByRole('dialog')).getByLabelText('Policy violation'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Suspend account' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Admin accounts cannot be modified');
  });

  it('flags accounts inactive for 60+ days and deactivates them only after reason + confirmation', async () => {
    AdminApi.deactivateInactive.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Old Caretaker');

    expect(within(cardOf('Old Caretaker')).getByText('Inactive 60+ days')).toBeInTheDocument();
    expect(within(cardOf('Juan Tenant')).queryByText('Inactive 60+ days')).not.toBeInTheDocument();
    expect(within(cardOf('Juan Tenant')).queryByRole('button', { name: 'Deactivate (inactive)' })).not.toBeInTheDocument();

    await user.click(within(cardOf('Old Caretaker')).getByRole('button', { name: 'Deactivate (inactive)' }));
    let dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(AdminApi.deactivateInactive).not.toHaveBeenCalled();

    await user.click(within(cardOf('Old Caretaker')).getByRole('button', { name: 'Deactivate (inactive)' }));
    dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByLabelText('No activity for over 60 days'));
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate account' }));
    await waitFor(() => expect(AdminApi.deactivateInactive).toHaveBeenCalledWith('u3', 'No activity for over 60 days'));
    expect(await screen.findByText('Old Caretaker has been deactivated for inactivity.')).toBeInTheDocument();
  });

  it('searches by name or email', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');
    await user.type(screen.getByRole('searchbox', { name: /search users/i }), 'ana@');
    expect(screen.getByText('Ana Landlord')).toBeInTheDocument();
    expect(screen.queryByText('Juan Tenant')).not.toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox', { name: /search users/i }));
    await user.type(screen.getByRole('searchbox', { name: /search users/i }), 'nobody');
    expect(screen.getByText('No users match these filters.')).toBeInTheDocument();
  });

  it('can show only the 60+ day inactive accounts', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');
    await user.click(screen.getByLabelText(/inactive 60\+ days only/i));
    expect(screen.queryByText('Juan Tenant')).not.toBeInTheDocument();
    expect(screen.getByText('Old Caretaker')).toBeInTheDocument();
  });

  it('never shows status-change actions for admin accounts', async () => {
    AdminApi.listUsers.mockResolvedValue({ users: [{ _id: 'a2', fullName: 'Other Admin', role: 'admin', email: 'a2@gmail.com', accountStatus: 'active' }] });
    renderPage();
    await screen.findByText('Other Admin');
    expect(screen.queryByRole('button', { name: /suspend/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
  });
});

describe('UsersPage reset codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'a1', fullName: 'Admin Cruz', role: 'admin' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    AdminApi.listUsers.mockResolvedValue(users);
  });

  it('offers a reset code for activated non-admin accounts only', async () => {
    renderPage();
    await screen.findByText('Juan Tenant');
    expect(within(cardOf('Juan Tenant')).getByRole('button', { name: /reset code/i })).toBeInTheDocument();
    expect(within(cardOf('Ana Landlord')).getByRole('button', { name: /reset code/i })).toBeInTheDocument();
    expect(within(cardOf('New Invitee')).queryByRole('button', { name: /reset code/i })).not.toBeInTheDocument();
  });

  it('offers Activate for a suspended account, but not for a caretaker who has not activated (phase 5)', async () => {
    renderPage();
    await screen.findByText('Juan Tenant');
    expect(within(cardOf('Ana Landlord')).getByRole('button', { name: 'Activate' })).toBeInTheDocument();
    expect(within(cardOf('New Invitee')).queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
  });

  it('never offers one for an admin account', async () => {
    AdminApi.listUsers.mockResolvedValue({ users: [{ _id: 'a2', fullName: 'Other Admin', role: 'admin', email: 'a2@gmail.com', accountStatus: 'active' }] });
    renderPage();
    await screen.findByText('Other Admin');
    expect(screen.queryByRole('button', { name: /reset code/i })).not.toBeInTheDocument();
  });

  it('opens the reset-code dialog for that person and shows the code', async () => {
    AdminApi.issueResetCode.mockResolvedValue({ code: 'ABCD-EFGH', expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');

    await user.click(within(cardOf('Juan Tenant')).getByRole('button', { name: /reset code/i }));
    expect(screen.getByText(/create a password reset code for juan tenant/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /create code/i }));

    expect(AdminApi.issueResetCode).toHaveBeenCalledWith('u1');
    expect(await screen.findByText('ABCD-EFGH')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(screen.queryByText('ABCD-EFGH')).not.toBeInTheDocument();
  });

  describe('main admin', () => {
    const admins = {
      users: [
        { _id: 'm1', fullName: 'Ledger Admin', role: 'admin', email: 'ledgeronboard@gmail.com', accountStatus: 'active', isMainAdmin: true, lastActivityAt: ago(60 * 1000) },
        { _id: 'a2', fullName: 'Second Admin', role: 'admin', email: 'second@gmail.com', accountStatus: 'active', isMainAdmin: false, lastActivityAt: ago(60 * 1000) },
      ],
    };

    it('a regular admin sees the badge but no Add admin button and no actions on admin accounts', async () => {
      AdminApi.listUsers.mockResolvedValue(admins);
      renderPage();
      expect(await screen.findByText('Main admin')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /add admin/i })).not.toBeInTheDocument();
      expect(within(cardOf('Second Admin')).queryByRole('button', { name: /suspend/i })).not.toBeInTheDocument();
    });

    it('the main admin can manage other admins but not the main admin account', async () => {
      useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'm1', fullName: 'Main Admin', role: 'admin', isMainAdmin: true } }));
      AdminApi.listUsers.mockResolvedValue(admins);
      renderPage();
      await screen.findByText('Second Admin');
      expect(within(cardOf('Second Admin')).getByRole('button', { name: /suspend/i })).toBeInTheDocument();
      expect(within(cardOf('Second Admin')).getByRole('button', { name: /reset code/i })).toBeInTheDocument();
      expect(within(cardOf('Ledger Admin')).queryByRole('button', { name: /suspend|reset code|deactivate/i })).not.toBeInTheDocument();
    });

    it('adds an admin and shows the one-time setup code', async () => {
      const user = userEvent.setup();
      useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'm1', fullName: 'Main Admin', role: 'admin', isMainAdmin: true } }));
      AdminApi.listUsers.mockResolvedValue(admins);
      AdminApi.createAdmin.mockResolvedValue({ user: { _id: 'a3', fullName: 'Bea Santos' }, code: 'WXYZ-2345', expiresAt: new Date(Date.now() + 1800000).toISOString() });
      renderPage();
      await user.click(await screen.findByRole('button', { name: /add admin/i }));
      // Rule from the user (2026-10-14): the email box takes the Gmail username (fixed "@gmail.com"),
      // and the phone is sent as +<country code><number>.
      await user.type(screen.getByLabelText(/first name/i), 'Bea');
      await user.type(screen.getByLabelText(/last name/i), 'Santos');
      await user.type(screen.getByRole('textbox', { name: 'Gmail username' }), 'bea');
      await user.type(screen.getByRole('textbox', { name: 'Phone' }), '09175550101');
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add admin$/i }));
      expect(AdminApi.createAdmin).toHaveBeenCalledWith({ firstName: 'Bea', lastName: 'Santos', email: 'bea@gmail.com', phone: '+639175550101' });
      expect(await screen.findByTestId('setup-code')).toHaveTextContent('WXYZ-2345');
      expect(AdminApi.listUsers).toHaveBeenCalledTimes(2);
    });
  });

  describe('archive', () => {
    const inArchive = (scheduledInDays) => ({
      users: [{
        _id: 'x1', fullName: 'Gone Tenant', role: 'tenant', email: 'gone@gmail.com', accountStatus: 'pending_deletion', statusReason: 'Duplicate account',
        deletion: { requestedAt: ago(DAY_MS), scheduledFor: new Date(Date.now() + scheduledInDays * DAY_MS).toISOString() },
      }],
    });

    it('moves an account to the archive after a reason is chosen', async () => {
      AdminApi.archiveUser.mockResolvedValue({});
      const user = userEvent.setup();
      renderPage();
      await user.click(within(await waitFor(() => cardOf('Juan Tenant'))).getByRole('button', { name: 'Move to archive' }));
      const dialog = screen.getByRole('dialog');
      await user.click(within(dialog).getByLabelText('Duplicate account'));
      await user.click(within(dialog).getByRole('button', { name: 'Move to archive' }));
      await waitFor(() => expect(AdminApi.archiveUser).toHaveBeenCalledWith('u1', 'Duplicate account'));
      expect(await screen.findByText(/moved to the archive/)).toBeInTheDocument();
    });

    it('a regular admin sees archived accounts with days left and can restore, but not delete', async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText('Juan Tenant');
      AdminApi.listUsers.mockResolvedValue(inArchive(12));
      AdminApi.restoreUser.mockResolvedValue({});
      await user.click(screen.getByRole('tab', { name: 'Archive' }));
      expect(AdminApi.listUsers).toHaveBeenLastCalledWith({ accountStatus: 'pending_deletion' });
      expect(await screen.findByText('Gone Tenant')).toBeInTheDocument();
      expect(screen.getByText('12 days left')).toBeInTheDocument();
      expect(screen.getByText('Reason: Duplicate account')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Delete now' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Restore' }));
      expect(AdminApi.restoreUser).toHaveBeenCalledWith('x1');
      expect(await screen.findByText('Gone Tenant has been restored.')).toBeInTheDocument();
    });

    it('the main admin can delete an archived account now, after confirming', async () => {
      const user = userEvent.setup();
      useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'm1', fullName: 'Main Admin', role: 'admin', isMainAdmin: true } }));
      AdminApi.listUsers.mockResolvedValue(inArchive(30));
      AdminApi.deleteUser.mockResolvedValue({ deleted: true });
      renderPage();
      await user.click(screen.getByRole('tab', { name: 'Archive' }));
      await user.click(await screen.findByRole('button', { name: 'Delete now' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(/can't be undone/)).toBeInTheDocument();
      expect(AdminApi.deleteUser).not.toHaveBeenCalled();
      await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
      expect(AdminApi.deleteUser).toHaveBeenCalledWith('x1');
      expect(await screen.findByText("Gone Tenant's account has been permanently deleted.")).toBeInTheDocument();
    });
  });
});
