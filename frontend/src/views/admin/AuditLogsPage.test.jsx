import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuditLogsPage from './AuditLogsPage.jsx';
import AdminApi from '../../services/AdminApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/AdminApi.js', () => ({ default: { listAuditLogs: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditLogsPage />
    </MemoryRouter>
  );
}

describe('AuditLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'a1', fullName: 'Admin Cruz', role: 'admin' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('requests the first 100 entries', async () => {
    AdminApi.listAuditLogs.mockResolvedValue({ logs: [] });
    renderPage();
    expect(await screen.findByText(/no audit entries yet/i)).toBeInTheDocument();
    expect(AdminApi.listAuditLogs).toHaveBeenCalledWith({ limit: 100 });
  });

  it('renders a table row per log entry with a readable action and result', async () => {
    AdminApi.listAuditLogs.mockResolvedValue({
      logs: [
        { _id: 'l1', createdAt: '2026-09-22T10:00:00Z', action: 'USER_LOGIN', actorRole: 'tenant', targetType: 'User', success: true },
        { _id: 'l2', createdAt: '2026-09-22T10:05:00Z', action: 'USER_LOGIN', actorRole: 'tenant', targetType: 'User', success: false },
      ],
    });
    renderPage();

    const table = await screen.findByRole('table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3); // header + 2 entries
    expect(within(rows[1]).getByText('User login')).toBeInTheDocument();
    expect(within(rows[1]).getByText('USER_LOGIN')).toBeInTheDocument(); // raw code kept for support
    expect(within(rows[1]).getByText('Tenant')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Success')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Failed')).toBeInTheDocument();
  });

  it('shows an error banner when logs fail to load', async () => {
    AdminApi.listAuditLogs.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load audit logs.');
  });
});
