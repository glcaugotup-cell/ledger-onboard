import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import Card from '../../components/ui/Card.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

export default function AssignedRoomsPage() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    ReservationApi.list()
      .then(({ reservations: list }) => setReservations(list.filter((r) => r.status === 'approved')))
      .catch(() => setError('Could not load your assigned rooms.'))
      .finally(() => setLoading(false));
  }, []);

  const rooms = useMemo(() => {
    const byRoom = new Map();
    for (const r of reservations) {
      const key = r.roomId?._id;
      if (!key) continue;
      if (!byRoom.has(key)) byRoom.set(key, { room: r.roomId, property: r.propertyId, tenants: [] });
      byRoom.get(key).tenants.push(r.tenantId);
    }
    return [...byRoom.values()];
  }, [reservations]);

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Assigned rooms</h1>
      <ErrorBanner message={error} />
      {loading && <LoadingState />}
      {!loading && rooms.length === 0 && <EmptyState title="No rooms assigned yet" description="You'll see rooms here once a landlord assigns you to an approved reservation." />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map(({ room, property, tenants }) => (
          <Card key={room._id}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-semibold text-gray-900">Room {room.roomNumber}</p>
              <Badge tone="brand">{property?.propertyName}</Badge>
            </div>
            <p className="mb-2 text-xs text-gray-400">
              {room.currentOccupancy}/{room.capacity} occupied
            </p>
            <p className="mb-1 text-xs font-medium text-gray-500">Tenants</p>
            <ul className="text-sm text-gray-700">
              {tenants.map((t) => (
                <li key={t._id}>{t.fullName}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
