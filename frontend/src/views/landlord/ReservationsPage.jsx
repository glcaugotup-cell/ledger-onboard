import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import TenancyManager from '../../components/TenancyManager.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import CaretakerApi from '../../services/CaretakerApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { CheckCircleIcon, ClockIcon, HomeModernIcon, KeyIcon } from '@heroicons/react/24/outline';
import { ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

/** Overview of every property's requests, reserved tenants, current tenants and history. */
export default function ReservationsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [reservations, setReservations] = useState([]);
  const [caretakers, setCaretakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () =>
    Promise.all([ReservationApi.list(), CaretakerApi.list()])
      .then(([r, c]) => {
        setReservations(r.reservations);
        setCaretakers(c.caretakers.filter((ct) => ct.accountStatus === 'active'));
        setError('');
      })
      .catch(() => setError('Could not load reservations.'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const counts = [
    { label: 'Awaiting review', value: reservations.filter((r) => r.status === 'pending').length, Icon: ClockIcon, tone: 'bg-amber-50 text-amber-700' },
    { label: 'Awaiting move-in', value: reservations.filter((r) => r.status === 'approved').length, Icon: KeyIcon, tone: 'bg-sky-50 text-sky-700' },
    { label: 'Current tenants', value: reservations.filter((r) => r.status === 'active').length, Icon: HomeModernIcon, tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Past reservations', value: reservations.filter((r) => !['pending', 'approved', 'active'].includes(r.status)).length, Icon: CheckCircleIcon, tone: 'bg-gray-100 text-gray-600' },
  ];

  return (
    <DashboardLayout>
      <PageHeader title="Reservations" description="Answer requests, confirm move-ins and manage current tenancies across all your properties." />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading reservations…" />}

      {!loading && (
        <div className="space-y-8">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {counts.map(({ label, value, Icon, tone }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></span>
                <div><p className="text-2xl font-semibold leading-none tabular-nums text-gray-900">{value}</p><p className="mt-1 text-xs font-medium text-gray-500">{label}</p></div>
              </div>
            ))}
          </div>
          <TenancyManager
            reservations={reservations}
            caretakers={caretakers}
            onChanged={load}
            showHistory
            highlightId={searchParams.get('reservation')}
            landlordHasQr={Boolean(user?.hasPaymentQr)}
          />
        </div>
      )}
    </DashboardLayout>
  );
}
