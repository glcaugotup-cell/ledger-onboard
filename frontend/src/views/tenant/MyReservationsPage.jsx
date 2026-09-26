import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDaysIcon, MapPinIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import PropertyImage from '../../components/PropertyImage.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import Button from '../../components/ui/Button.jsx';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../../components/ui/Feedback.jsx';
import { formatDate } from '../../utils/format.js';

const STATUS_TONE = { pending: 'yellow', approved: 'green', rejected: 'red', cancelled: 'gray', completed: 'blue' };
const STATUS_NOTE = {
  pending: 'Waiting for the landlord to respond.',
  approved: 'Approved — this is your current stay.',
  completed: 'Your stay here has ended.',
  cancelled: 'This request was cancelled.',
};

export default function MyReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    ReservationApi.list()
      .then(({ reservations: list }) => setReservations(list))
      .catch(() => setError('Could not load your reservations.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <PageHeader title="My reservations" description="Your room requests and stays." />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading your reservations…" />}
      {!loading && reservations.length === 0 && !error && (
        <EmptyState
          icon={CalendarDaysIcon}
          title="No reservations yet"
          description="Browse properties and request a room to get started."
          action={
            <Link to="/tenant/discover">
              <Button>Discover boarding houses</Button>
            </Link>
          }
        />
      )}
      <div className="space-y-3">
        {reservations.map((r) => {
          const property = r.propertyId || {};
          return (
            <div key={r._id} className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:flex-row">
              <PropertyImage property={property} className="h-32 w-full shrink-0 sm:h-auto sm:w-44" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{property.propertyName}</p>
                    <p className="text-sm text-gray-600">Room {r.roomId?.roomNumber}</p>
                  </div>
                  <StatusBadge status={r.status} tones={STATUS_TONE} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />
                    Move-in {formatDate(r.moveInDate)}
                  </span>
                  {property.address?.barangay && (
                    <span className="inline-flex items-center gap-1">
                      <MapPinIcon className="h-4 w-4" aria-hidden="true" />
                      {property.address.barangay}
                    </span>
                  )}
                </div>
                {r.status === 'rejected' && r.rejectionReason ? (
                  <p className="text-sm text-red-600">Reason: {r.rejectionReason}</p>
                ) : (
                  STATUS_NOTE[r.status] && <p className="text-sm text-gray-500">{STATUS_NOTE[r.status]}</p>
                )}
                {property._id && (
                  <Link to={`/tenant/properties/${property._id}`} className="mt-auto self-start rounded text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    View property
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
