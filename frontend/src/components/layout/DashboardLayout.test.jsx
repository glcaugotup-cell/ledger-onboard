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
    // The name shows on both the sidebar and the header account menus.
    expect(screen.getAllByText('Landlord Cruz').length).toBeGreaterThan(0);
  });

  it('R11: tenants get My Apartment below My Reservations; Billing and Maintenance moved inside it', () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    renderLayout();
    const sidebar = screen.getAllByRole('navigation', { name: 'Main' })[0];
    const labels = within(sidebar).getAllByRole('link').map((link) => link.textContent);
    expect(labels).toEqual(['Discover', 'My Reservations', 'My Apartment']);
  });

  it.each(['tenant', 'landlord', 'caretaker'])('M9: the %s account menu has Account, Archive and Log out (no Billing)', async (role) => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Someone', role, hasPaymentQr: true } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getAllByRole('button', { name: 'Open account menu' })[0]);
    const menuLinks = screen.getByRole('link', { name: 'Account' }).parentElement;
    expect(within(menuLinks).getAllByRole('link').map((link) => link.textContent)).toEqual(['Account', 'Archive']);
    expect(within(menuLinks).getByRole('link', { name: 'Archive' })).toHaveAttribute('href', `/${role}/archive`);
  });

  it('X1: clicking a notification marks it read and opens its deep link', async () => {
    const markRead = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue({
      unreadCount: 1,
      markRead,
      notifications: [{ _id: 'n1', title: 'New bill', message: 'Your bill is ready.', read: false, link: '/tenant/apartment?tab=billing&bill=b1' }],
    }));
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: /notifications, 1 unread/i }));
    await user.click(screen.getByRole('button', { name: /new bill/i }));
    expect(markRead).toHaveBeenCalledWith('n1');
    expect(navigateMock).toHaveBeenCalledWith('/tenant/apartment?tab=billing&bill=b1');
  });

  it('X1: older notifications without a link still open the matching item', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Landlord Cruz', role: 'landlord', hasPaymentQr: true } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue({
      unreadCount: 1,
      markRead: vi.fn().mockResolvedValue({}),
      notifications: [{ _id: 'n2', title: 'New maintenance issue', message: 'Plumbing.', read: false, type: 'MAINTENANCE_ISSUE_CREATED', relatedType: 'MaintenanceIssue', relatedId: 'i7' }],
    }));
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: /notifications, 1 unread/i }));
    await user.click(screen.getByRole('button', { name: /new maintenance issue/i }));
    expect(navigateMock).toHaveBeenCalledWith('/landlord/issues?issue=i7');
  });

  it('P1: a landlord without a GCash QR sees a banner pointing to Account', () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Landlord Cruz', role: 'landlord', hasPaymentQr: false } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    renderLayout();
    expect(screen.getByText(/Upload your GCash QR code so tenants can pay their bills/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload it in Account' })).toHaveAttribute('href', '/landlord/profile');
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
    expect(within(menu).getByRole('link', { name: 'Maintenance Issues' })).toHaveAttribute('href', '/landlord/issues');

    // Log out lives in the account menu at the bottom of the mobile menu.
    await user.click(within(menu).getByRole('button', { name: 'Open account menu' }));
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

  it('caps the unread badge at "99+"', () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tenant Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue({ unreadCount: 150 }));
    renderLayout();
    expect(screen.getByText('99+')).toBeInTheDocument();
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

    await user.click(screen.getAllByRole('button', { name: 'Open account menu' })[0]);
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

    await user.click(screen.getAllByRole('button', { name: 'Open account menu' })[0]);
    await user.click(screen.getByRole('button', { name: /log out/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Log Out' }));

    await waitFor(() => expect(logout).toHaveBeenCalled());
    expect(navigateMock).toHaveBeenCalledWith('/');
  });

  it.each(['tenant', 'landlord', 'caretaker', 'admin'])('links the account menu to the profile page for the %s dashboard', async (role) => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Someone', role } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getAllByRole('button', { name: 'Open account menu' })[0]);
    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', `/${role}/profile`);
  });

  describe('Back button', () => {
    function renderAt(path, role, back) {
      useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Test User', role } }));
      useNotificationsMock.mockReturnValue(mockNotificationsValue());
      return render(
        <MemoryRouter initialEntries={[path]}>
          <DashboardLayout back={back}>
            <h1>Page title</h1>
          </DashboardLayout>
        </MemoryRouter>
      );
    }
    const backButtons = () => screen.queryAllByRole('button', { name: /^(Go back|Back to )/ });

    it.each([
      ['tenant', '/tenant/discover'],
      ['landlord', '/landlord/dashboard'],
      ['caretaker', '/caretaker/rooms'],
      ['admin', '/admin/users'],
    ])('the %s dashboard home (%s) has no Back button', (role, path) => {
      renderAt(path, role);
      expect(backButtons()).toHaveLength(0);
    });

    it.each([
      ['tenant', '/tenant/reservations', 'Back to Discover', '/tenant/discover'],
      ['tenant', '/tenant/apartment', 'Back to Discover', '/tenant/discover'],
      ['landlord', '/landlord/payments', 'Back to Dashboard', '/landlord/dashboard'],
      ['caretaker', '/caretaker/utilities', 'Back to Assigned Rooms', '/caretaker/rooms'],
      ['admin', '/admin/logs', 'Back to Users', '/admin/users'],
    ])('a %s sidebar page (%s) goes back to the home page', async (role, path, label, home) => {
      const user = userEvent.setup();
      renderAt(path, role);
      await user.click(screen.getByRole('button', { name: label }));
      expect(navigateMock).toHaveBeenCalledWith(home);
    });

    it('sits above the page title, first in the content area', () => {
      renderAt('/tenant/reservations', 'tenant');
      const main = document.getElementById('main-content');
      expect(main.firstElementChild).toBe(screen.getByRole('button', { name: 'Back to Discover' }));
      expect(main.firstElementChild.compareDocumentPosition(screen.getByRole('heading', { name: 'Page title' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('other pages fall back to the page fallback (or home) when there is no previous in-app page', async () => {
      const user = userEvent.setup();
      renderAt('/landlord/properties/p1', 'landlord', { fallback: '/landlord/properties' });
      await user.click(screen.getByRole('button', { name: 'Go back' }));
      expect(navigateMock).toHaveBeenCalledWith('/landlord/properties');

      navigateMock.mockClear();
      renderAt('/caretaker/profile', 'caretaker');
      await user.click(screen.getAllByRole('button', { name: 'Go back' }).at(-1));
      expect(navigateMock).toHaveBeenCalledWith('/caretaker/rooms');
    });

    it('can be disabled by the page (e.g. while uploading)', () => {
      renderAt('/landlord/verification', 'landlord', { disabled: true });
      expect(screen.getByRole('button', { name: 'Back to Dashboard' })).toBeDisabled();
    });
  });
});
