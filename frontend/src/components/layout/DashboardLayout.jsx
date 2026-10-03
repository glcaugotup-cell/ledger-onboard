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
  ChevronUpDownIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ClipboardDocumentListIcon,
  CreditCardIcon,
  DocumentTextIcon,
  HomeModernIcon,
  MagnifyingGlassIcon,
  ArrowUpRightIcon,
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
import logo from '../../assets/Logo.png';
import sidebarHouse from '../../assets/housedesign1.webp';
import PropertyApi from '../../services/PropertyApi.js';
import ReservationApi from '../../services/ReservationApi.js';

const NAV_BY_ROLE = {
  tenant: [
    { to: '/tenant/discover', label: 'Discover', icon: MagnifyingGlassIcon },
    { to: '/tenant/reservations', label: 'My Reservations', icon: CalendarDaysIcon },
    { to: '/tenant/billing', label: 'Billing', icon: DocumentTextIcon },
    { to: '/tenant/issues', label: 'Maintenance Issues', icon: ClipboardDocumentListIcon },
  ],
  landlord: [
    { to: '/landlord/dashboard', label: 'Dashboard', icon: ChartBarIcon },
    { to: '/landlord/properties', label: 'Properties', icon: BuildingOffice2Icon },
    { to: '/landlord/reservations', label: 'Reservations', icon: CalendarDaysIcon },
    { to: '/landlord/caretakers', label: 'Caretakers', icon: UserGroupIcon },
    { to: '/landlord/billing', label: 'Billing', icon: DocumentTextIcon },
    { to: '/landlord/payments', label: 'Payments', icon: CreditCardIcon },
    { to: '/landlord/issues', label: 'Maintenance Issues', icon: ClipboardDocumentListIcon },
    { to: '/landlord/verification', label: 'Verification', icon: ShieldCheckIcon },
  ],
  caretaker: [
    { to: '/caretaker/rooms', label: 'Assigned Rooms', icon: HomeModernIcon },
    { to: '/caretaker/utilities', label: 'Utility Entry', icon: BoltIcon },
    { to: '/caretaker/payments', label: 'Cash & Payments', icon: CreditCardIcon },
    { to: '/caretaker/issues', label: 'Maintenance Tasks', icon: ClipboardDocumentListIcon },
  ],
  admin: [
    { to: '/admin/users', label: 'Users', icon: UsersIcon },
    { to: '/admin/reviews', label: 'Review Moderation', icon: StarIcon },
    { to: '/admin/landlord-verifications', label: 'Landlord Verification', icon: ShieldCheckIcon },
    { to: '/admin/logs', label: 'Audit Logs', icon: ClipboardDocumentListIcon },
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

function notificationPath(notification, role) {
  if (notification.relatedType === 'MaintenanceIssue' || notification.type?.startsWith('MAINTENANCE_ISSUE_')) {
    if (role === 'landlord') return '/landlord/issues';
    if (role === 'caretaker') return '/caretaker/issues';
    return '/tenant/issues';
  }
  if (notification.relatedType === 'Reservation' || notification.type?.startsWith('RESERVATION_')) {
    if (role === 'landlord') return '/landlord/reservations';
    if (role === 'caretaker') return '/caretaker/rooms';
    if (role === 'admin') return '/admin/users';
    return '/tenant/reservations';
  }
  if (notification.relatedType === 'BillingSOA' || notification.type?.startsWith('BILL_')) return '/tenant/billing';
  if (notification.relatedType === 'PaymentTransaction' || notification.type?.startsWith('PAYMENT_')) {
    if (role === 'landlord') return '/landlord/payments';
    if (role === 'caretaker') return '/caretaker/payments';
    return '/tenant/billing';
  }
  if (notification.relatedType === 'LandlordVerification' || notification.type?.startsWith('BUSINESS_VERIFICATION_')) {
    return role === 'admin' ? '/admin/landlord-verifications' : '/landlord/verification';
  }
  return role === 'landlord' ? '/landlord/dashboard' : role === 'caretaker' ? '/caretaker/rooms' : role === 'admin' ? '/admin/users' : '/tenant/discover';
}

function NotificationBell({ unreadCount, notifications, markRead, markAllRead, role, sidebarItem = false, collapsed = false, mobile = false, dark = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useDismiss(open, ref, () => setOpen(false));

  const openNotification = (notification) => {
    setOpen(false);
    if (!notification.read) markRead(notification._id).catch(() => {});
    navigate(notificationPath(notification, role));
  };

  return (
    <div className={`relative ${sidebarItem ? 'w-full' : ''}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${sidebarItem ? `relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${dark ? 'text-brand-50 hover:bg-white/10 hover:text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'} ${collapsed ? 'justify-center px-2' : ''}` : 'relative rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700'} ${focusRing}`}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <BellIcon className={sidebarItem ? 'h-5 w-5 shrink-0' : 'h-6 w-6'} aria-hidden="true" />
        {sidebarItem && !collapsed && <span className="flex-1 text-left">Notifications</span>}
        {unreadCount > 0 && (
          <span className={`${sidebarItem ? 'absolute right-2 top-1/2 min-w-5 -translate-y-1/2' : 'absolute right-0.5 top-0.5 min-w-4'} flex h-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className={`absolute z-[70] w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ${sidebarItem ? (mobile ? 'bottom-full left-0 mb-2' : 'bottom-0 left-full ml-2') : 'right-0 mt-2'}`}>
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            <button onClick={markAllRead} className={`rounded text-xs font-medium text-brand-700 hover:underline ${focusRing}`}>
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {notifications.length === 0 && <p className="px-2 py-6 text-center text-sm text-gray-500">You&apos;re all caught up.</p>}
            {notifications.map((n) => (
              <button
                key={n._id}
                type="button"
                onClick={() => openNotification(n)}
                className={`flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${n.read ? 'text-gray-500' : 'bg-brand-50/70 text-gray-800'}`}
                aria-label={`${n.title}. ${n.message}. Open related page`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-brand-500'}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium">{n.title}</span>
                  <span className="block text-xs text-gray-500">{n.message}</span>
                  {n.createdAt && <span className="mt-0.5 block text-[11px] text-gray-500">{formatRelative(n.createdAt)}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountMenu({ user, collapsed = false, mobile = false, dark = false, header = false, onLogout }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismiss(open, ref, () => setOpen(false));
  const profilePath = `/${user?.role}/profile`;
  const billingPath = user?.role === 'landlord' ? '/landlord/billing' : user?.role === 'tenant' ? '/tenant/billing' : null;

  return (
    <div ref={ref} className={`relative mt-2 ${mobile ? 'w-full' : ''}`}>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close account menu' : 'Open account menu'}
        aria-expanded={open}
        className={`${header ? 'min-h-10 w-auto gap-2 rounded-full px-2 py-1' : `min-h-14 w-full gap-2.5 rounded-xl p-2.5 ${dark ? 'bg-white/10 hover:bg-white/15' : 'bg-transparent hover:bg-gray-100/80'}`} flex items-center border-0 text-left shadow-none transition ${focusRing} ${collapsed ? 'justify-center' : ''}`}
      >
        {user?.profilePhotoUrl ? (
          <img src={user.profilePhotoUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#dcebe2] text-sm font-semibold text-[#174a3b] ${header ? 'h-9 w-9' : 'h-10 w-10'}`} aria-hidden="true">{initials(user?.fullName)}</span>
        )}
        {!collapsed && <span className={`min-w-0 text-sm leading-tight ${header ? 'hidden text-left sm:block' : 'flex-1'}`}><span className={`block truncate font-medium ${dark ? 'text-white' : 'text-gray-900'}`}>{user?.fullName}</span><span className={`mt-0.5 block truncate text-xs ${dark ? 'text-brand-100' : 'text-gray-600'}`}>{header ? formatStatus(user?.role) : user?.email || formatStatus(user?.role)}</span></span>}
        {!collapsed && <ChevronUpDownIcon className={`h-4 w-4 shrink-0 ${dark ? 'text-brand-100' : 'text-gray-500'}`} aria-hidden="true" />}
      </button>
      {open && (
        <div className={`absolute z-50 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl ${header ? 'right-0 top-[calc(100%+0.5rem)] w-64' : mobile ? 'bottom-[calc(100%+0.5rem)] left-0 w-full' : 'bottom-0 left-full ml-2 w-64'}`}>
          <div className="flex items-center gap-2.5 border-b border-gray-100 px-3 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800" aria-hidden="true">{initials(user?.fullName)}</span>
            <span className="min-w-0 text-sm leading-tight"><span className="block truncate font-medium text-gray-900">{user?.fullName}</span><span className="block truncate text-xs text-gray-500">{user?.email || formatStatus(user?.role)}</span></span>
          </div>
          <div className="p-1.5">
            <NavLink to={profilePath} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 ${focusRing}`}>
              <UserCircleIcon className="h-4 w-4" aria-hidden="true" />Account
            </NavLink>
            {billingPath && <NavLink to={billingPath} onClick={() => setOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 ${focusRing}`}><CreditCardIcon className="h-4 w-4" aria-hidden="true" />Billing</NavLink>}
          </div>
          <div className="border-t border-gray-100 p-1.5">
            <button type="button" onClick={onLogout} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 ${focusRing}`}><ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />Log out</button>
          </div>
        </div>
      )}
    </div>
  );
}

function GlobalSearch({ role }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  useDismiss(open, ref, () => setOpen(false));

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [propertyResponse, reservationResponse] = await Promise.allSettled([
          role === 'landlord' ? PropertyApi.listMine() : PropertyApi.search({ text: term }),
          role === 'landlord' ? ReservationApi.list() : Promise.resolve({ reservations: [] }),
        ]);
        if (!active) return;
        const properties = propertyResponse.status === 'fulfilled' ? propertyResponse.value?.properties || [] : [];
        const reservations = reservationResponse.status === 'fulfilled' ? reservationResponse.value?.reservations || [] : [];
        const lower = term.toLowerCase();
        const propertyResults = properties
          .filter((property) => `${property.propertyName || ''} ${property.barangay || ''} ${property.city || ''}`.toLowerCase().includes(lower))
          .slice(0, 4)
          .map((property) => ({ label: property.propertyName, detail: [property.barangay, property.city].filter(Boolean).join(', ') || 'Property', to: role === 'landlord' ? `/landlord/properties/${property._id}` : `/tenant/properties/${property._id}`, kind: 'Property' }));
        const reservationResults = reservations
          .filter((item) => `${item.roomId?.roomNumber || ''} ${item.propertyId?.propertyName || ''} ${item.tenantId?.fullName || ''} ${item.status || ''}`.toLowerCase().includes(lower))
          .slice(0, 3)
          .map((item) => ({ label: item.propertyId?.propertyName || `Room ${item.roomId?.roomNumber || ''} reservation`, detail: `${formatStatus(item.status)} · ${item.tenantId?.fullName || 'Reservation'}`, to: '/landlord/reservations', kind: 'Reservation' }));
        setResults([...propertyResults, ...reservationResults].slice(0, 6));
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query, role]);

  const staticResults = (NAV_BY_ROLE[role] || []).filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 4)
    .map((item) => ({ label: item.label, detail: 'Go to section', to: item.to, kind: 'Page' }));
  const visibleResults = [...staticResults, ...results].slice(0, 6);

  return (
    <div ref={ref} className="relative w-full max-w-[31rem]">
      <label className="flex h-11 items-center gap-3 rounded-xl border border-transparent bg-[#f2f1ed] px-3.5 text-gray-500 shadow-inner shadow-gray-900/[0.02] transition focus-within:border-[#97b6a6] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#dcebe2]">
        <MagnifyingGlassIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <input maxLength={200} value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value.slice(0, 200)); setOpen(true); }} placeholder="Search properties, tenants, or requests..." className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500" aria-label="Search properties, tenants, or requests" aria-expanded={open} />
        <kbd className="hidden rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] text-gray-400 md:inline">/</kbd>
      </label>
      {open && (query.trim().length > 0) && <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[80] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
        {query.trim().length < 2 ? <p className="px-4 py-3 text-sm text-gray-500">Type at least 2 characters to search.</p> : loading ? <p className="px-4 py-3 text-sm text-gray-500">Searching…</p> : visibleResults.length ? visibleResults.map((item, index) => <button key={`${item.kind}-${item.to}-${index}`} type="button" onClick={() => { setOpen(false); setQuery(''); navigate(item.to); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f2f7f4]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f2ec] text-[#1d684e]"><ArrowUpRightIcon className="h-4 w-4" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-gray-900">{item.label}</span><span className="block truncate text-xs text-gray-500">{item.detail}</span></span><span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{item.kind}</span>
        </button>) : <p className="px-4 py-3 text-sm text-gray-500">No matching properties or requests found.</p>}
      </div>}
    </div>
  );
}

export default function DashboardLayout({ children }) {
  const { user, logout } = useAuth();
  const { unreadCount, notifications, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const mobileMenuRef = useRef(null);

  const links = NAV_BY_ROLE[user?.role] || [];
  useDismiss(menuOpen, mobileMenuRef, () => setMenuOpen(false));

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
      <div className="flex min-h-screen w-full">
        {links.length > 0 && (
          <aside className={`sticky top-0 z-50 hidden h-screen shrink-0 self-start flex-col border-r border-[#21453c] bg-[#0c3028] transition-[width] duration-250 ease-[var(--ease-panel)] xl:flex ${sidebarCollapsed ? 'w-20' : 'w-64'}`}>
            <div className={`flex border-b border-white/10 px-3 ${sidebarCollapsed ? 'flex-col items-center gap-2 py-3' : 'h-16 items-center justify-between gap-2'}`}>
              <div className={`flex min-w-0 items-center gap-2 ${sidebarCollapsed ? 'justify-center' : ''}`}>
                {!sidebarCollapsed && <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />}
                {!sidebarCollapsed && <span className="truncate text-sm font-bold text-white">Ledger OnBoard</span>}
              </div>
              <button type="button" onClick={() => setSidebarCollapsed((v) => !v)} className={`rounded-lg p-2 text-brand-100 hover:bg-white/10 hover:text-white ${focusRing}`} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                {sidebarCollapsed ? <ChevronDoubleRightIcon className="h-5 w-5" aria-hidden="true" /> : <ChevronDoubleLeftIcon className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
            {!sidebarCollapsed && <p className="px-5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-200">Workspace</p>}
            <nav aria-label="Main" className={`shrink-0 space-y-1 py-3 ${sidebarCollapsed ? 'px-2' : 'px-3'}`}>
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} title={sidebarCollapsed ? link.label : undefined} aria-label={sidebarCollapsed ? link.label : undefined} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${focusRing} ${sidebarCollapsed ? 'justify-center px-2' : ''} ${isActive ? 'bg-[#d8b873] text-[#21372f] shadow-sm' : 'text-brand-50 hover:bg-white/10 hover:text-white'}`}>
                  <link.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                  {!sidebarCollapsed && <span className="truncate">{link.label}</span>}
                </NavLink>
              ))}
            </nav>
            <div className="flex-1" />
            {!sidebarCollapsed && <div className="pointer-events-none absolute inset-x-0 bottom-[4.7rem] h-48 opacity-[0.16]" aria-hidden="true"><img src={sidebarHouse} alt="" className="h-full w-full object-contain object-bottom" /></div>}
            <div className="border-t border-white/10 p-3">
              <AccountMenu user={user} collapsed={sidebarCollapsed} dark onLogout={openLogout} />
            </div>
          </aside>
        )}

        {menuOpen && links.length > 0 && (
          <div className="fixed inset-0 z-40 xl:hidden">
            <button type="button" className="absolute inset-0 h-full w-full bg-gray-900/30" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
            <nav id="mobile-menu" ref={mobileMenuRef} aria-label="Main" className="animate-drawer-enter relative flex h-full w-[min(20rem,85vw)] flex-col border-r border-[#21453c] bg-[#0c3028] p-3 shadow-xl">
              <div className="mb-3 flex min-h-16 items-center justify-between gap-2 border-b border-white/10 px-2 pb-3">
                <div className="flex min-w-0 items-center gap-2">
                  <img src={logo} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                  <span className="truncate text-sm font-bold text-white">Ledger OnBoard</span>
                </div>
                <button type="button" onClick={() => setMenuOpen(false)} className={`rounded-lg p-2 text-brand-100 hover:bg-white/10 hover:text-white ${focusRing}`} aria-label="Close menu"><XMarkIcon className="h-5 w-5" aria-hidden="true" /></button>
              </div>
              <div className="space-y-1">
                {links.map((link) => (
                  <NavLink key={link.to} to={link.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${focusRing} ${isActive ? 'bg-[#d8b873] text-[#21372f] shadow-sm' : 'text-brand-50 hover:bg-white/10 hover:text-white'}`}>
                    <link.icon className="h-5 w-5" aria-hidden="true" />{link.label}
                  </NavLink>
                ))}
              </div>
              <div className="flex-1" />
              <div className="border-t border-white/10 pt-3">
                <AccountMenu user={user} mobile dark onLogout={openLogout} />
              </div>
            </nav>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-[#e9e8e3] bg-[#fffdfa]/95 px-4 shadow-[0_2px_12px_rgba(20,40,32,0.035)] backdrop-blur sm:px-6">
            {links.length > 0 && <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={() => setMenuOpen((v) => !v)} className={`rounded-lg p-2 text-gray-600 hover:bg-gray-100 xl:hidden ${focusRing}`} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="mobile-menu">
              {menuOpen ? <XMarkIcon className="h-5 w-5" aria-hidden="true" /> : <Bars3Icon className="h-5 w-5" aria-hidden="true" />}
            </button>}
            <GlobalSearch role={user?.role} />
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-4">
              <NotificationBell unreadCount={unreadCount} notifications={notifications} markRead={markRead} markAllRead={markAllRead} role={user?.role} />
              <span className="hidden h-8 w-px bg-gray-200 sm:block" aria-hidden="true" />
              <AccountMenu user={user} header onLogout={openLogout} />
            </div>
          </header>
          <main id="main-content" className="px-4 py-5 sm:px-6 sm:py-6 xl:px-7 xl:py-7">
            {children}
          </main>
        </div>
      </div>
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
