import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import logo from '../../assets/logo.webp';

const NAV_BY_ROLE = {
  tenant: [
    { to: '/tenant/discover', label: 'Discover' },
    { to: '/tenant/reservations', label: 'My Reservations' },
    { to: '/tenant/billing', label: 'Billing' },
    { to: '/tenant/profile', label: 'Profile' },
  ],
  landlord: [
    { to: '/landlord/dashboard', label: 'Dashboard' },
    { to: '/landlord/properties', label: 'Properties' },
    { to: '/landlord/reservations', label: 'Reservations' },
    { to: '/landlord/caretakers', label: 'Caretakers' },
    { to: '/landlord/billing', label: 'Billing' },
    { to: '/landlord/payments', label: 'Payments' },
    { to: '/landlord/verification', label: 'Verification' },
    { to: '/landlord/profile', label: 'Profile' },
  ],
  caretaker: [
    { to: '/caretaker/rooms', label: 'Assigned Rooms' },
    { to: '/caretaker/utilities', label: 'Utility Entry' },
    { to: '/caretaker/payments', label: 'Cash & Payments' },
    { to: '/caretaker/profile', label: 'Profile' },
  ],
  admin: [
    { to: '/admin/users', label: 'Users' },
    { to: '/admin/reviews', label: 'Review Moderation' },
    { to: '/admin/landlord-verifications', label: 'Landlord Verification' },
    { to: '/admin/logs', label: 'Audit Logs' },
    { to: '/admin/profile', label: 'Profile' },
  ],
};

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const { unreadCount, notifications, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const links = NAV_BY_ROLE[user?.role] || [];
  // Long nav lists (landlord: 8 links) only fit inline from xl; shorter ones from lg.
  // Below that, the scrollable second-row nav is used instead.
  const wideNav = links.length > 5;

  // Runs only after the user confirms in the dialog; Cancel keeps them signed in.
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setLogoutOpen(false);
    }
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-8">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover shadow-sm" />
              <span className="truncate text-lg font-bold text-brand-700">Ledger OnBoard</span>
            </div>
            <nav className={`hidden gap-1 ${wideNav ? 'xl:flex' : 'lg:flex'}`}>
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100"
                aria-label="Notifications"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
                  <div className="mb-2 flex items-center justify-between px-2">
                    <span className="text-sm font-semibold">Notifications</span>
                    <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                      Mark all read
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 && <p className="px-2 py-4 text-center text-xs text-gray-400">No notifications</p>}
                    {notifications.map((n) => (
                      <div key={n._id} className={`rounded-lg px-2 py-2 text-sm ${n.read ? 'text-gray-500' : 'bg-brand-50 text-gray-800'}`}>
                        <p className="font-medium">{n.title}</p>
                        <p className="text-xs text-gray-500">{n.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="hidden whitespace-nowrap text-right text-sm sm:block">
              <p className="font-medium text-gray-800">{user?.fullName}</p>
              <p className="text-xs capitalize text-gray-400">{user?.role}</p>
            </div>
            <button onClick={() => setLogoutOpen(true)} className="whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
              Log out
            </button>
            <ConfirmDialog
              open={logoutOpen}
              title="Log out?"
              message="Are you sure you want to log out?"
              confirmLabel="Log Out"
              loading={loggingOut}
              onConfirm={handleLogout}
              onCancel={() => setLogoutOpen(false)}
            />
          </div>
        </div>
        <nav className={`flex gap-1 overflow-x-auto border-t border-gray-100 px-4 py-1 ${wideNav ? 'xl:hidden' : 'lg:hidden'}`}>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600'}`}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
