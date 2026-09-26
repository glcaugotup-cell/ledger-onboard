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
vi.mock('../../services/AdminApi.js', () => ({ default: { listUsers: vi.fn(), setUserStatus: vi.fn(), deactivateInactive: vi.fn() } }));

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
