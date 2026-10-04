import { useEffect, useState } from 'react';
import { ArchiveBoxIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { EmptyState, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import MaintenanceIssueApi from '../../services/MaintenanceIssueApi.js';
import PropertyApi from '../../services/PropertyApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate } from '../../utils/format.js';
import { describeApiError } from '../../utils/errors.js';

const DESCRIPTION = {
  tenant: 'Resolved issues you moved out of your list. Restore one to see it again; your landlord always keeps the record.',
  landlord: 'Hidden properties and maintenance reports you removed. Nothing here is erased; restore anything you need back.',
  caretaker: 'Tasks you archived from your list. Archiving only changes your own view.',
};

/**
 * M9: the account menu's Archive. Tenants and caretakers see the issues they archived;
 * landlords see hidden (soft-deleted) properties and the reports they removed.
 * Every item can be restored.
 */
export default function ArchivePage() {
  const { user } = useAuth();
  const role = user?.role;
  const [issues, setIssues] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [restoring, setRestoring] = useState(null); // { kind: 'issue'|'property', item }
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = () =>
    Promise.all([
      MaintenanceIssueApi.list({ archived: 'true' }),
      role === 'landlord' ? PropertyApi.listArchived() : Promise.resolve({ properties: [] }),
    ])
      .then(([issueResponse, propertyResponse]) => {
        setIssues(issueResponse.issues || []);
        setProperties(propertyResponse.properties || []);
        setError('');
      })
      .catch(() => setError('Could not load your archive.'))
      .finally(() => setLoading(false));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (role) load(); }, [role]);

  const restore = async () => {
    setBusy(true);
    setDialogError('');
    try {
      if (restoring.kind === 'property') await PropertyApi.restore(restoring.item._id);
      else await MaintenanceIssueApi.restore(restoring.item._id);
      setMessage(restoring.kind === 'property' ? 'Property restored to your listings.' : role === 'landlord' ? 'Report restored. The tenant has been notified.' : 'Restored to your list.');
      setRestoring(null);
      await load();
    } catch (err) {
      setDialogError(describeApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const empty = !loading && issues.length === 0 && properties.length === 0;

  return (
    <DashboardLayout>
      <PageHeader title="Archive" description={DESCRIPTION[role]} />
      <div className="mb-4 space-y-2"><ErrorBanner message={error} /><SuccessBanner message={message} /></div>
      {loading && <LoadingState label="Loading your archive…" />}
      {empty && <EmptyState icon={ArchiveBoxIcon} title="Your archive is empty" description="Items you archive or hide appear here, ready to restore." />}

      {role === 'landlord' && properties.length > 0 && (
        <section aria-labelledby="archived-properties" className="mb-8">
          <h2 id="archived-properties" className="mb-3 text-base font-semibold text-gray-900">Hidden properties</h2>
          <div className="space-y-2">
            {properties.map((property) => (
              <Card key={property._id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{property.propertyName}</p>
                    <p className="text-xs text-gray-500">{property.address?.barangay}{property.deletedAt ? ` · Hidden ${formatDate(property.deletedAt)}` : ''}</p>
                  </div>
                  <Button variant="secondary" onClick={() => { setDialogError(''); setRestoring({ kind: 'property', item: property }); }}>Restore</Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {issues.length > 0 && (
        <section aria-labelledby="archived-issues">
          <h2 id="archived-issues" className="mb-3 text-base font-semibold text-gray-900">{role === 'landlord' ? 'Removed maintenance reports' : 'Maintenance issues'}</h2>
          <div className="space-y-2">
            {issues.map((issue) => (
              <Card key={issue._id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{issue.category} · Room {issue.roomId?.roomNumber}</p>
                    <p className="line-clamp-2 text-sm text-gray-600">{issue.description}</p>
                    <p className="mt-1 text-xs text-gray-500">{issue.propertyId?.propertyName} · Reported {formatDate(issue.createdAt)}{role !== 'tenant' && issue.tenantId?.fullName ? ` · ${issue.tenantId.fullName}` : ''}</p>
                    {role === 'landlord' && issue.removedReason && <p className="mt-1 text-sm text-red-700">Removed {formatDate(issue.removedAt)}: {issue.removedReason}</p>}
                  </div>
                  <Button variant="secondary" onClick={() => { setDialogError(''); setRestoring({ kind: 'issue', item: issue }); }}>Restore</Button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(restoring)}
        title="Restore this item?"
        message={restoring?.kind === 'property'
          ? 'The property will appear in your listings and in search again.'
          : role === 'landlord' ? 'The report returns to Issue management and the tenant is notified.' : 'It returns to your list.'}
        confirmLabel="Restore"
        loading={busy}
        error={dialogError}
        onConfirm={restore}
        onCancel={() => setRestoring(null)}
      />
    </DashboardLayout>
  );
}
