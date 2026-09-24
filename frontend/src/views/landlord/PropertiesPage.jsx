import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Button from '../../components/ui/Button.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

const STATUS_TONE = { draft: 'gray', pending_moderation: 'yellow', approved: 'green', rejected: 'red', inactive: 'gray' };

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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">My properties</h1>
        {isVerified ? (
          <Link to="/landlord/properties/new">
            <Button>+ New property</Button>
          </Link>
        ) : (
          <Link to="/landlord/verification">
            <Button variant="secondary">Verify business to add a property</Button>
          </Link>
        )}
      </div>
      {!isVerified && (
        <p className="mb-4 text-xs text-amber-700">
          Complete{' '}
          <Link to="/landlord/verification" className="font-semibold underline">
            business verification
          </Link>{' '}
          before you can create a new property listing.
        </p>
      )}
      <ErrorBanner message={error} />
      {loading && <LoadingState />}
      {!loading && properties.length === 0 && <EmptyState title="No properties yet" description="Create your first listing to start accepting reservations." />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((p) => (
          <Link key={p._id} to={`/landlord/properties/${p._id}`} className="block rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md">
            <div className="mb-1 flex items-center justify-between">
              <p className="font-semibold text-gray-900">{p.propertyName}</p>
              <Badge tone={STATUS_TONE[p.listingStatus]}>{p.listingStatus.replace('_', ' ')}</Badge>
            </div>
            <p className="text-sm text-gray-500">{p.address?.barangay}, {p.address?.city}</p>
          </Link>
        ))}
      </div>
    </DashboardLayout>
  );
}
