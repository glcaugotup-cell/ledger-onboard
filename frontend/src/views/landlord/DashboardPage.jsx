import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BanknotesIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CreditCardIcon,
  DocumentTextIcon,
  HomeModernIcon,
  PlusIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import AnalyticsApi from '../../services/AnalyticsApi.js';
import LandlordVerificationApi from '../../services/LandlordVerificationApi.js';
import ReservationApi from '../../services/ReservationApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import PropertyApi from '../../services/PropertyApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatTile from '../../components/charts/StatTile.jsx';
import RevenueTrendChart from '../../components/charts/RevenueTrendChart.jsx';
import RoomStatusChart from '../../components/charts/RoomStatusChart.jsx';
import { Badge, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';
import PropertyImage from '../../components/PropertyImage.jsx';
import heroHouse from '../../assets/housedesign1.webp';
import { mediaUrl } from '../../services/apiClient.js';
import { formatPeso, formatRelative, formatStatus } from '../../utils/format.js';

function VerificationBanner({ status, rejectionReason }) {
  if (status === 'VERIFIED') return null;

  if (status === 'PENDING') {
    return (
      <Card className="mb-6 border-yellow-200 bg-yellow-50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900">Business verification pending</p>
            <p className="text-sm text-gray-600">Your submitted documents are under admin review. You&apos;ll be notified once they&apos;re verified.</p>
          </div>
          <Badge tone="yellow">Pending</Badge>
        </div>
      </Card>
    );
  }

  if (status === 'REJECTED') {
    return (
      <Card className="mb-6 border-red-200 bg-red-50">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900">Business verification rejected</p>
            <p className="text-sm text-gray-600">{rejectionReason || 'Your submitted documents were not approved.'}</p>
          </div>
          <Link to="/landlord/verification">
            <Button variant="danger">Resubmit documents</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-amber-200 bg-amber-50">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-gray-900">Business verification required</p>
          <p className="text-sm text-gray-600">Submit your Mayor&apos;s/Business Permit and BIR Form 2303 before you can upload or publish boarding houses.</p>
        </div>
        <Link to="/landlord/verification">
          <Button>Submit documents</Button>
        </Link>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState(null);
  const [properties, setProperties] = useState([]);
  const [activity, setActivity] = useState([]);
  // Counts and recent rows for the dashboard activity areas.
  const [pending, setPending] = useState({ reservations: null, payments: null });

  useEffect(() => {
    AnalyticsApi.getLandlordAnalytics()
      .then(setData)
      .catch(() => setError('Could not load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    Promise.allSettled([ReservationApi.list(), PaymentApi.list()]).then(([res, pay]) => {
      const reservations = res.status === 'fulfilled' ? res.value?.reservations || [] : [];
      const payments = pay.status === 'fulfilled' ? pay.value?.payments || [] : [];
      setPending({
        reservations: res.status === 'fulfilled' ? reservations.filter((r) => r.status === 'pending').length : null,
        payments: pay.status === 'fulfilled' ? payments.filter((p) => p.verificationStatus === 'PENDING').length : null,
      });
      setActivity([
        ...reservations.map((item) => ({ ...item, activityKind: 'reservation' })),
        ...payments.map((item) => ({ ...item, activityKind: 'payment' })),
      ].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5));
    });
  }, []);

  useEffect(() => {
    PropertyApi.listMine().then(({ properties: list }) => setProperties(list.slice(0, 3))).catch(() => setProperties([]));
  }, []);

  useEffect(() => {
    if (user?.businessVerificationStatus === 'REJECTED') {
      LandlordVerificationApi.getMine()
        .then(({ submission: s }) => setSubmission(s))
        .catch(() => {});
    }
  }, [user?.businessVerificationStatus]);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || '';
  const coverImage = properties[0]?.images?.[0] ? mediaUrl(properties[0].images[0]) : heroHouse;
  return (
    <DashboardLayout>
      <section className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative flex min-h-40 overflow-hidden rounded-2xl bg-[#10352d] shadow-sm sm:min-h-44">
          <img src={coverImage} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0b2a24]/95 via-[#0b2a24]/75 to-[#0b2a24]/15" />
          <div className="relative z-10 flex max-w-xl flex-col justify-center p-5 text-white sm:p-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-100">Welcome back,</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{firstName ? `${firstName}!` : 'Landlord!'}</h1>
            <p className="mt-1.5 text-sm text-white/85">Here&apos;s what&apos;s happening with your properties today.</p>
            <span className="mt-3 block h-1 w-12 rounded-full bg-amber-300" />
          </div>
        </div>
        <div className="flex min-h-40 flex-col justify-center gap-2 rounded-2xl border border-[#eee9dd] bg-[#fcfaf4] p-3.5 shadow-sm sm:min-h-44 sm:p-4">
          <Link to="/landlord/reservations" className="group flex min-h-16 items-center gap-3 rounded-xl px-1.5 py-2 transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff1d5] text-amber-700"><CalendarDaysIcon className="h-5 w-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-medium text-gray-500">Upcoming</span><span className="mt-0.5 block text-sm font-semibold text-gray-900">{pending.reservations ?? '—'} request{pending.reservations === 1 ? '' : 's'} waiting for your answer</span></span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d7b66f] text-white transition group-hover:bg-[#c7a454]"><ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></span>
          </Link>
          {user?.businessVerificationStatus === 'VERIFIED' && <Link to="/landlord/properties/new" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#f5df8c] px-4 py-2.5 text-sm font-semibold text-[#26372d] transition hover:bg-[#f2d66d] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><PlusIcon className="h-4 w-4" aria-hidden="true" />New property</Link>}
        </div>
      </section>
      <VerificationBanner status={user?.businessVerificationStatus} rejectionReason={submission?.rejectionReason} />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading your dashboard…" />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2 2xl:grid-cols-4">
            <StatTile appearance="dashboard" palette="green" icon={HomeModernIcon} label="Occupancy rate" value={`${data.occupancyRate}%`} sublabel={`${data.occupiedRooms}/${data.totalRooms} rooms occupied`} progress={data.occupancyRate} />
            <StatTile appearance="dashboard" palette="gold" icon={UserGroupIcon} label="Collection rate" value={`${data.collectionRate}%`} sublabel={`${formatPeso(data.verifiedPaymentsTotal)} collected`} progress={data.collectionRate} />
            <StatTile
              icon={BanknotesIcon}
              appearance="dashboard"
              palette="mint"
              label="Outstanding debt"
              value={formatPeso(data.outstandingDebt)}
              tone={data.outstandingDebt > 0 ? 'critical' : 'good'}
              sublabel="unpaid + overdue"
            />
            <StatTile appearance="dashboard" palette="blue" icon={DocumentTextIcon} label="Properties" value={data.totalProperties} sublabel={`${data.totalRooms} rooms total`} />
          </div>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
            <Card title="Revenue trend" description="Payments collected per billing month" className="rounded-2xl border-gray-200/80 shadow-sm 2xl:col-span-2">
              <RevenueTrendChart data={data.revenueTrend} />
            </Card>
            <Card title="Recent activity" description="The latest updates across your account" className="rounded-2xl border-gray-200/80 shadow-sm">
              {activity.length ? <div className="divide-y divide-gray-100">
                {activity.map((item) => {
                  const reservation = item.activityKind === 'reservation';
                  const Icon = reservation ? CalendarDaysIcon : CreditCardIcon;
                  const label = reservation ? `Reservation ${formatStatus(item.status).toLowerCase()}` : `Payment ${formatStatus(item.verificationStatus).toLowerCase()}`;
                  const detail = reservation
                    ? `${item.roomId?.roomNumber ? `Room ${item.roomId.roomNumber}` : 'Room request'}${item.propertyId?.propertyName ? ` · ${item.propertyId.propertyName}` : ''}`
                    : `${formatPeso(item.amount || 0)}${item.tenantName ? ` · ${item.tenantName}` : ''}`;
                  return <div key={`${item.activityKind}-${item._id}`} className="flex items-start gap-3 py-3 first:pt-1 last:pb-1">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${reservation ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-gray-800">{label}</p><p className="truncate text-xs text-gray-500">{detail}</p></div>
                    {item.createdAt && <span className="shrink-0 pt-0.5 text-[11px] text-gray-400">{formatRelative(item.createdAt)}</span>}
                  </div>;
                })}
              </div> : <div className="flex min-h-40 flex-col items-center justify-center text-center"><CheckCircleIcon className="h-8 w-8 text-emerald-600" aria-hidden="true" /><p className="mt-2 text-sm font-medium text-gray-700">You&apos;re all caught up</p><p className="mt-1 text-xs text-gray-500">New reservations and payments will appear here.</p></div>}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-3">
            <Card title="Properties overview" description="Your latest boarding house listings" className="rounded-2xl border-gray-200/80 shadow-sm 2xl:col-span-2" action={<Link to="/landlord/properties" className="text-xs font-semibold text-brand-700 hover:underline">View all</Link>}>
              {properties.length ? <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {properties.slice(0, 2).map((property) => <Link key={property._id} to={`/landlord/properties/${property._id}`} className="flex items-center gap-3 rounded-xl border border-gray-100 p-2.5 transition hover:border-brand-200 hover:bg-brand-50/40">
                  <PropertyImage property={property} className="h-20 w-24 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-800">{property.propertyName}</p><p className="mt-1 truncate text-xs text-gray-500">{property.roomCount || 0} rooms · {property.availableRooms || 0} available</p><p className="mt-2 text-sm font-semibold text-gray-900">{property.startingRent != null ? `${formatPeso(property.startingRent)} / month` : 'No rooms listed'}</p></div>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
                </Link>)}
              </div> : <p className="py-8 text-center text-sm text-gray-500">No properties to show yet.</p>}
            </Card>
            <Card title="Property status" description="Room availability at a glance" className="rounded-2xl border-gray-200/80 shadow-sm">
              <RoomStatusChart breakdown={data.roomStatusBreakdown} />
            </Card>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
