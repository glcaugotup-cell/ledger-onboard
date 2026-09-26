import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BuildingOffice2Icon, MapPinIcon, PlusIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import PropertyImage from '../../components/PropertyImage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../../components/ui/Button.jsx';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../../components/ui/Feedback.jsx';
import { formatPeso } from '../../utils/format.js';

const STATUS_TONE = { draft: 'gray', pending_moderation: 'yellow', approved: 'green', rejected: 'red', inactive: 'gray' };

/** Occupancy as a bar plus numbers, so it reads at a glance without relying on color alone. */
function OccupancyBar({ occupied, total }) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>Occupancy</span>
        <span className="tabular-nums">
          {occupied}/{total} slots · {pct}%
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" role="presentation">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function PropertiesPage() {
  const { user } = useAuth();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isVerified = user?.businessVerificationStatus === 'VERIFIED';

  useEffect(() => {
    PropertyApi.listMine()
      .then(({ properties: list }) => setProperties(list))
      .catch(() => setError('Could not load your properties.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <PageHeader
        title="My properties"
        description="Your boarding house listings, their rooms and occupancy."
        actions={
          isVerified ? (
            <Link to="/landlord/properties/new">
              <Button>
                <PlusIcon className="h-4 w-4" aria-hidden="true" /> New property
              </Button>
            </Link>
          ) : (
            <Link to="/landlord/verification">
              <Button variant="secondary">Verify business to add a property</Button>
            </Link>
          )
        }
      />
      {!isVerified && (
        <p className="-mt-3 mb-5 text-sm text-amber-700">
          Complete{' '}
          <Link to="/landlord/verification" className="font-semibold underline">
            business verification
          </Link>{' '}
          before you can create a new property listing.
        </p>
      )}
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading your properties…" />}
      {!loading && properties.length === 0 && (
        <EmptyState icon={BuildingOffice2Icon} title="No properties yet" description="Create your first listing to start accepting reservations." />
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((p) => (
          <Link
            key={p._id}
            to={`/landlord/properties/${p._id}`}
            className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <PropertyImage property={p} className="h-36 w-full" />
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-gray-900 group-hover:text-brand-700">{p.propertyName}</p>
                <StatusBadge status={p.listingStatus} tones={STATUS_TONE} />
              </div>
              <p className="-mt-2 flex items-center gap-1 text-sm text-gray-500">
                <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {p.address?.barangay}, {p.address?.city}
              </p>
              {p.roomCount !== undefined && (
                <div className="mt-auto space-y-3 border-t border-gray-100 pt-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">
                      {p.roomCount} room{p.roomCount === 1 ? '' : 's'} · {p.availableRooms} available
                    </span>
                    {p.startingRent !== null && <span className="font-semibold text-gray-900">From {formatPeso(p.startingRent)}</span>}
                  </div>
                  <OccupancyBar occupied={p.occupiedSlots} total={p.totalSlots} />
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </DashboardLayout>
  );
}
