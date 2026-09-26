import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  BellIcon,
  BoltIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  DocumentTextIcon,
  HomeModernIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  StarIcon,
  UserCircleIcon,
  UserGroupIcon,
  UsersIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNotifications } from '../../context/NotificationContext.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { formatRelative, formatStatus, initials } from '../../utils/format.js';
import logo from '../../assets/logo.webp';

const NAV_BY_ROLE = {
  tenant: [
    { to: '/tenant/discover', label: 'Discover', icon: MagnifyingGlassIcon },
    { to: '/tenant/reservations', label: 'My Reservations', icon: CalendarDaysIcon },
    { to: '/tenant/billing', label: 'Billing', icon: DocumentTextIcon },
    { to: '/tenant/profile', label: 'Profile', icon: UserCircleIcon },
  ],
  landlord: [
    { to: '/landlord/dashboard', label: 'Dashboard', icon: ChartBarIcon },
    { to: '/landlord/properties', label: 'Properties', icon: BuildingOffice2Icon },
    { to: '/landlord/reservations', label: 'Reservations', icon: CalendarDaysIcon },
    { to: '/landlord/caretakers', label: 'Caretakers', icon: UserGroupIcon },
    { to: '/landlord/billing', label: 'Billing', icon: DocumentTextIcon },
    { to: '/landlord/payments', label: 'Payments', icon: CreditCardIcon },
    { to: '/landlord/verification', label: 'Verification', icon: ShieldCheckIcon },
    { to: '/landlord/profile', label: 'Profile', icon: UserCircleIcon },
  ],
  caretaker: [
    { to: '/caretaker/rooms', label: 'Assigned Rooms', icon: HomeModernIcon },
    { to: '/caretaker/utilities', label: 'Utility Entry', icon: BoltIcon },
    { to: '/caretaker/payments', label: 'Cash & Payments', icon: CreditCardIcon },
    { to: '/caretaker/profile', label: 'Profile', icon: UserCircleIcon },
  ],
  admin: [
    { to: '/admin/users', label: 'Users', icon: UsersIcon },
    { to: '/admin/reviews', label: 'Review Moderation', icon: StarIcon },
    { to: '/admin/landlord-verifications', label: 'Landlord Verification', icon: ShieldCheckIcon },
    { to: '/admin/logs', label: 'Audit Logs', icon: ClipboardDocumentListIcon },
    { to: '/admin/profile', label: 'Profile', icon: UserCircleIcon },
  ],
};

const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

/** Closes a popover on Escape or a click outside `ref`. */
function useDismiss(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    const onPointer = (e) => ref.current && !ref.current.contains(e.target) && onClose();
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open, ref, onClose]);
}

function NotificationBell({ unreadCount, notifications, markAllRead }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, ref, () => setOpen(false));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 ${focusRing}`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <BellIcon className="h-6 w-6" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            <button onClick={markAllRead} className={`rounded text-xs font-medium text-brand-700 hover:underline ${focusRing}`}>
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {notifications.length === 0 && <p className="px-2 py-6 text-center text-sm text-gray-500">You&apos;re all caught up.</p>}
            {notifications.map((n) => (
              <div key={n._id} className={`flex gap-2.5 rounded-lg px-2.5 py-2 text-sm ${n.read ? 'text-gray-500' : 'bg-brand-50/70 text-gray-800'}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-500'}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-gray-500">{n.message}</p>
                  {n.createdAt && <p className="mt-0.5 text-[11px] text-gray-500">{formatRelative(n.createdAt)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const { unreadCount, notifications, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const links = NAV_BY_ROLE[user?.role] || [];
  // Long nav lists (landlord: 8 links) only fit inline from xl; shorter ones from lg.
  // Below that, the menu button opens the same links in a panel.
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

  const openLogout = () => {
    setMenuOpen(false);
    setLogoutOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-4 2xl:gap-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover shadow-sm" />
              <span className="whitespace-nowrap text-lg font-bold text-brand-700">Ledger OnBoard</span>
            </div>
            <nav aria-label="Main" className={`hidden gap-1 ${wideNav ? 'xl:flex' : 'lg:flex'}`}>
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${focusRing} ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`
                  }
                >
                  {/* The 8-link landlord menu only has room for icons on very wide screens. */}
                  <link.icon className={`h-4 w-4 ${wideNav ? 'hidden 2xl:block' : ''}`} aria-hidden="true" />
                  {link.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <NotificationBell unreadCount={unreadCount} notifications={notifications} markAllRead={markAllRead} />

            <div className="hidden items-center gap-2.5 sm:flex">
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
                title={user?.fullName}
                aria-hidden="true"
              >
                {initials(user?.fullName)}
              </span>
              {/* With the long landlord menu, the name only fits beside the avatar on very wide screens. */}
              <div className={`whitespace-nowrap text-sm leading-tight ${wideNav ? 'xl:hidden 2xl:block' : ''}`}>
                <p className="font-medium text-gray-800">{user?.fullName}</p>
                <p className="text-xs text-gray-500">{formatStatus(user?.role)}</p>
              </div>
            </div>
            <button
              onClick={openLogout}
              className={`hidden items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 sm:flex ${focusRing}`}
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />
              Log out
            </button>
            {links.length > 0 && (
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className={`rounded-lg p-2 text-gray-600 hover:bg-gray-100 ${wideNav ? 'xl:hidden' : 'lg:hidden'} ${focusRing}`}
                aria-label={menuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
              >
                {menuOpen ? <XMarkIcon className="h-6 w-6" aria-hidden="true" /> : <Bars3Icon className="h-6 w-6" aria-hidden="true" />}
              </button>
            )}
          </div>
        </div>

        {/* Phone/tablet menu: every link with room to tap, plus the account actions. */}
        {menuOpen && (
          <nav id="mobile-menu" aria-label="Main" className={`border-t border-gray-100 bg-white px-4 pb-4 pt-2 ${wideNav ? 'xl:hidden' : 'lg:hidden'}`}>
            <div className="mb-2 flex items-center gap-3 border-b border-gray-100 px-1 py-3 sm:hidden">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800" aria-hidden="true">
                {initials(user?.fullName)}
              </span>
              <div className="text-sm leading-tight">
                <p className="font-medium text-gray-800">{user?.fullName}</p>
                <p className="text-xs text-gray-500">{formatStatus(user?.role)}</p>
              </div>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${focusRing} ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-gray-700 hover:bg-gray-100'
                    }`
                  }
                >
                  <link.icon className="h-5 w-5" aria-hidden="true" />
                  {link.label}
                </NavLink>
              ))}
            </div>
            <button
              onClick={openLogout}
              className={`mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 sm:hidden ${focusRing}`}
            >
              <ArrowRightOnRectangleIcon className="h-5 w-5" aria-hidden="true" />
              Log out
            </button>
          </nav>
        )}
      </header>
      <main id="main-content" className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        {children}
      </main>
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
  );
}
