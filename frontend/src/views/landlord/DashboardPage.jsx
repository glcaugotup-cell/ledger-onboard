import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BanknotesIcon,
  BuildingOffice2Icon,
  CalendarDaysIcon,
  ChartPieIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import AnalyticsApi from '../../services/AnalyticsApi.js';
import LandlordVerificationApi from '../../services/LandlordVerificationApi.js';
import ReservationApi from '../../services/ReservationApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import StatTile from '../../components/charts/StatTile.jsx';
import RevenueTrendChart from '../../components/charts/RevenueTrendChart.jsx';
import RoomStatusChart from '../../components/charts/RoomStatusChart.jsx';
import { Badge, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';
import { formatPeso } from '../../utils/format.js';

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

/** One row of the "Needs your attention" panel: what's waiting and where to handle it. */
function AttentionItem({ to, icon: Icon, tone, text }) {
  const tones = { amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-600', brand: 'bg-brand-50 text-brand-700' };
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-3 transition-colors hover:border-brand-200 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium text-gray-800">{text}</span>
      <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}

function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState(null);
  // Counts for the attention panel; null until loaded (the panel still works without them).
  const [pending, setPending] = useState({ reservations: null, payments: null });

  useEffect(() => {
    AnalyticsApi.getLandlordAnalytics()
      .then(setData)
      .catch(() => setError('Could not load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    Promise.allSettled([ReservationApi.list(), PaymentApi.list()]).then(([res, pay]) => {
      setPending({
        reservations: res.status === 'fulfilled' ? (res.value?.reservations || []).filter((r) => r.status === 'pending').length : null,
        payments: pay.status === 'fulfilled' ? (pay.value?.payments || []).filter((p) => p.verificationStatus === 'PENDING').length : null,
      });
    });
  }, []);

  useEffect(() => {
    if (user?.businessVerificationStatus === 'REJECTED') {
      LandlordVerificationApi.getMine()
        .then(({ submission: s }) => setSubmission(s))
        .catch(() => {});
    }
  }, [user?.businessVerificationStatus]);

  const firstName = user?.firstName || user?.fullName?.split(' ')[0] || '';
  const attention = [];
  if (pending.reservations > 0) {
    attention.push({ to: '/landlord/reservations', icon: CalendarDaysIcon, tone: 'amber', text: `${pending.reservations} reservation request${pending.reservations === 1 ? '' : 's'} waiting for your answer` });
  }
  if (pending.payments > 0) {
    attention.push({ to: '/landlord/payments', icon: CreditCardIcon, tone: 'amber', text: `${pending.payments} payment${pending.payments === 1 ? '' : 's'} to verify` });
  }
  if (data?.outstandingDebt > 0) {
    attention.push({ to: '/landlord/billing', icon: ExclamationTriangleIcon, tone: 'red', text: `${formatPeso(data.outstandingDebt)} still unpaid across your statements` });
  }

  return (
    <DashboardLayout>
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : 'Dashboard'}
        description="Here's how your boarding houses are doing."
        actions={
          user?.businessVerificationStatus === 'VERIFIED' && (
            <Link to="/landlord/properties/new">
              <Button>
                <PlusIcon className="h-4 w-4" aria-hidden="true" /> New property
              </Button>
            </Link>
          )
        }
      />
      <VerificationBanner status={user?.businessVerificationStatus} rejectionReason={submission?.rejectionReason} />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading your dashboard…" />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={ChartPieIcon} label="Occupancy rate" value={`${data.occupancyRate}%`} sublabel={`${data.occupiedRooms}/${data.totalRooms} rooms occupied`} />
            <StatTile icon={BanknotesIcon} label="Collection rate" value={`${data.collectionRate}%`} sublabel={`${formatPeso(data.verifiedPaymentsTotal)} collected`} />
            <StatTile
              icon={DocumentTextIcon}
              label="Outstanding debt"
              value={formatPeso(data.outstandingDebt)}
              tone={data.outstandingDebt > 0 ? 'critical' : 'good'}
              sublabel="unpaid + overdue"
            />
            <StatTile icon={BuildingOffice2Icon} label="Properties" value={data.totalProperties} sublabel={`${data.totalRooms} rooms total`} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card title="Revenue trend" description="Payments collected per billing month" className="lg:col-span-2">
              <RevenueTrendChart data={data.revenueTrend} />
            </Card>
            <Card title="Needs your attention">
              {attention.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CheckCircleIcon className="h-8 w-8 text-green-500" aria-hidden="true" />
                  <p className="text-sm font-medium text-gray-700">You&apos;re all caught up.</p>
                  <p className="text-xs text-gray-500">New requests, payments to verify and unpaid bills show up here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {attention.map((item) => (
                    <AttentionItem key={item.to} {...item} />
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card title="Room status" description="Across all your properties">
            <RoomStatusChart breakdown={data.roomStatusBreakdown} />
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
