import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BanknotesIcon, BoltIcon, HomeModernIcon, MapPinIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import Card from '../../components/ui/Card.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';
import { initials } from '../../utils/format.js';

const actionLink =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

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
      <PageHeader title="Assigned rooms" description="Rooms you look after and the tenants living in them." />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading your rooms…" />}
      {!loading && rooms.length === 0 && !error && (
        <EmptyState icon={HomeModernIcon} title="No rooms assigned yet" description="You'll see rooms here once a landlord assigns you to an approved reservation." />
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map(({ room, property, tenants }) => {
          const pct = room.capacity ? Math.round((room.currentOccupancy / room.capacity) * 100) : 0;
          return (
            <Card key={room._id} className="flex flex-col">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-gray-900">Room {room.roomNumber}</p>
                  {property?.propertyName && <p className="text-sm text-gray-600">{property.propertyName}</p>}
                  {property?.address?.barangay && (
                    <p className="flex items-center gap-1 text-xs text-gray-500">
                      <MapPinIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {property.address.barangay}
                    </p>
                  )}
                </div>
                <Badge tone="brand">
                  {tenants.length} tenant{tenants.length === 1 ? '' : 's'}
                </Badge>
              </div>

              <div className="mb-4">
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>Occupancy</span>
                  <span className="tabular-nums">
                    {room.currentOccupancy}/{room.capacity} occupied
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" role="presentation">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tenants</p>
              <ul className="mb-4 space-y-2">
                {tenants.map((t) => (
                  <li key={t._id} className="flex items-center gap-2.5 text-sm text-gray-800">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600" aria-hidden="true">
                      {initials(t.fullName)}
                    </span>
                    {t.fullName}
                  </li>
                ))}
              </ul>

              <div className="mt-auto grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
                <Link to="/caretaker/utilities" className={actionLink}>
                  <BoltIcon className="h-4 w-4" aria-hidden="true" /> Log reading
                </Link>
                <Link to="/caretaker/payments" className={actionLink}>
                  <BanknotesIcon className="h-4 w-4" aria-hidden="true" /> Record cash
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
