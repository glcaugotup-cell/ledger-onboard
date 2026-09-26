import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from './DashboardLayout.jsx';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock, navigateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useNotificationsMock: vi.fn(),
  navigateMock: vi.fn(),
}));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderLayout() {
  return render(
    <MemoryRouter>
      <DashboardLayout>
        <p>Page content</p>
      </DashboardLayout>
    </MemoryRouter>
  );
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the nav links for the current role and the page children', () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    renderLayout();

    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Caretakers' }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: 'Assigned Rooms' })).toHaveLength(0);
    expect(screen.getByText('Page content')).toBeInTheDocument();
    expect(screen.getByText('Landlord Cruz')).toBeInTheDocument();
  });

  it('renders no nav links for an unknown role', () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Nobody', role: 'ghost' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    renderLayout();
    expect(screen.queryAllByRole('link', { name: 'Dashboard' })).toHaveLength(0);
  });

  it('shows an unread badge and lists notifications when opened', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(
      mockNotificationsValue({
        unreadCount: 2,
        notifications: [{ _id: 'n1', title: 'Reservation approved', message: 'Your reservation was approved.', read: false }],
      })
    );
    const user = userEvent.setup();
    renderLayout();

    expect(screen.getByText('2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /notifications/i }));

    expect(screen.getByText('Reservation approved')).toBeInTheDocument();
  });

  it('opens a menu with every link and a Log out action on small screens', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    const user = userEvent.setup();
    renderLayout();

    expect(document.getElementById('mobile-menu')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    const menu = document.getElementById('mobile-menu');
    expect(within(menu).getAllByRole('link')).toHaveLength(8);
    expect(within(menu).getByRole('button', { name: /log out/i })).toBeInTheDocument();

    await user.click(within(menu).getByRole('button', { name: /log out/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Are you sure you want to log out?');
    expect(document.getElementById('mobile-menu')).toBeNull();
  });

  it('closes the notifications panel with Escape', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByText("You're all caught up.")).not.toBeInTheDocument();
  });

  it('caps the unread badge at "9+"', () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue({ unreadCount: 15 }));
    renderLayout();
    expect(screen.getByText('9+')).toBeInTheDocument();
  });

  it('marks all notifications read from the dropdown', async () => {
    const markAllRead = vi.fn();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue({ unreadCount: 1, markAllRead }));
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /notifications/i }));
    await user.click(screen.getByRole('button', { name: /mark all read/i }));

    expect(markAllRead).toHaveBeenCalled();
  });

  it('asks for confirmation; Cancel keeps the user signed in', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' }, logout }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /log out/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Are you sure you want to log out?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('logs out and navigates to the landing page after confirming', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' }, logout }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole('button', { name: /log out/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log Out' }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it.each(['tenant', 'landlord', 'caretaker', 'admin'])('shows a Profile link for the %s dashboard', (role) => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Someone', role } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    renderLayout();
    expect(screen.getAllByRole('link', { name: 'Profile' })[0]).toHaveAttribute('href', `/${role}/profile`);
  });
});
