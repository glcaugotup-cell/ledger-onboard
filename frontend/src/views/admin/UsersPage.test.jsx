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
vi.mock('../../services/AdminApi.js', () => ({ default: { listUsers: vi.fn(), setUserStatus: vi.fn() } }));

const users = {
  users: [
    { _id: 'u1', fullName: 'Juan Tenant', role: 'tenant', email: 'juan@gmail.com', accountStatus: 'active' },
    { _id: 'u2', fullName: 'Ana Landlord', role: 'landlord', email: 'ana@gmail.com', accountStatus: 'suspended' },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <UsersPage />
    </MemoryRouter>
  );
}

describe('UsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'a1', fullName: 'Admin Cruz', role: 'admin' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    AdminApi.listUsers.mockResolvedValue(users);
  });

  it('lists users with their role and status badge', async () => {
    renderPage();
    expect(await screen.findByText('Juan Tenant')).toBeInTheDocument();
    expect(screen.getByText('Ana Landlord')).toBeInTheDocument();
    expect(screen.getByText('suspended')).toBeInTheDocument();
  });

  it('re-fetches with the selected role filter', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');

    await user.selectOptions(screen.getByRole('combobox'), 'landlord');

    await waitFor(() => {
      expect(AdminApi.listUsers).toHaveBeenLastCalledWith({ role: 'landlord' });
    });
  });

  it('suspends an active user', async () => {
    AdminApi.setUserStatus.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('Juan Tenant');

    const juanCard = screen.getByText('Juan Tenant').closest('div.rounded-xl');
    await user.click(within(juanCard).getByRole('button', { name: /suspend/i }));

    await waitFor(() => {
      expect(AdminApi.setUserStatus).toHaveBeenCalledWith('u1', { status: 'suspended', reason: undefined });
    });
  });

  it('never shows status-change actions for admin accounts', async () => {
    AdminApi.listUsers.mockResolvedValue({ users: [{ _id: 'a2', fullName: 'Other Admin', role: 'admin', email: 'a2@gmail.com', accountStatus: 'active' }] });
    renderPage();
    await screen.findByText('Other Admin');
    expect(screen.queryByRole('button', { name: /suspend/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /deactivate/i })).not.toBeInTheDocument();
  });
});
