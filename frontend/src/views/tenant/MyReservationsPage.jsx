import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import Card from '../../components/ui/Card.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

const STATUS_TONE = { pending: 'yellow', approved: 'green', rejected: 'red', cancelled: 'gray', completed: 'blue' };

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
      <h1 className="mb-4 text-xl font-semibold text-gray-900">My reservations</h1>
      <ErrorBanner message={error} />
      {loading && <LoadingState />}
      {!loading && reservations.length === 0 && <EmptyState title="No reservations yet" description="Browse properties and request a room to get started." />}
      <div className="space-y-3">
        {reservations.map((r) => (
          <Card key={r._id}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-gray-900">{r.propertyId?.propertyName}</p>
                <p className="text-sm text-gray-500">Room {r.roomId?.roomNumber}</p>
                <p className="text-xs text-gray-400">Move-in: {new Date(r.moveInDate).toLocaleDateString()}</p>
                {r.status === 'rejected' && r.rejectionReason && <p className="mt-1 text-xs text-red-500">Reason: {r.rejectionReason}</p>}
              </div>
              <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
