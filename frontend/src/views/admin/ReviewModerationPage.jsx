import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import ReviewApi from '../../services/ReviewApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ReasonDialog from '../../components/ReasonDialog.jsx';
import { StarIcon } from '@heroicons/react/24/outline';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';
import { formatDate } from '../../utils/format.js';

export default function ReviewModerationPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [moderating, setModerating] = useState(null); // { id, status } awaiting a reason

  const load = () => {
    setLoading(true);
    ReviewApi.listPendingModeration()
      .then(({ reviews: list }) => setReviews(list))
      .catch(() => setError('Could not load pending reviews.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (id, status, reason) => {
    setBusyId(id);
    try {
      await ReviewApi.moderate(id, { status, reason });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Review moderation" description="Approve tenant reviews before they appear on property pages." />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading reviews…" />}
      {!loading && reviews.length === 0 && !error && (
        <EmptyState icon={StarIcon} title="Nothing pending review" description="New tenant reviews wait here until you approve, reject or hide them." />
      )}
      <div className="space-y-3">
        {reviews.map((r) => (
          <Card key={r._id}>
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{r.tenantId?.fullName} — {r.propertyId?.propertyName}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {r.createdAt && <span>Submitted {formatDate(r.createdAt)}</span>}
                  {r.isVerifiedFormerTenant && <Badge tone="green">Verified former tenant</Badge>}
                </p>
              </div>
              <span className="text-lg leading-none text-amber-500" role="img" aria-label={`${r.rating} out of 5 stars`}>
                {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
              </span>
            </div>
            {r.comment && <blockquote className="mb-4 border-l-2 border-gray-200 pl-3 text-sm text-gray-700">{r.comment}</blockquote>}
            <div className="flex flex-wrap gap-2">
              <Button loading={busyId === r._id} onClick={() => act(r._id, 'APPROVED')}>
                Approve
              </Button>
              <Button variant="danger" loading={busyId === r._id} onClick={() => setModerating({ id: r._id, status: 'REJECTED' })}>
                Reject
              </Button>
              <Button variant="ghost" loading={busyId === r._id} onClick={() => setModerating({ id: r._id, status: 'HIDDEN' })}>
                Hide
              </Button>
            </div>
          </Card>
        ))}
      </div>
      {moderating && (
        <ReasonDialog
          open
          title={moderating.status === 'REJECTED' ? 'Reject this review?' : 'Hide this review?'}
          message="The review won't be shown publicly. You can add a reason for the record (optional)."
          required={false}
          confirmLabel={moderating.status === 'REJECTED' ? 'Reject review' : 'Hide review'}
          onConfirm={(reason) => {
            const { id, status } = moderating;
            setModerating(null);
            act(id, status, reason || undefined);
          }}
          onCancel={() => setModerating(null)}
        />
      )}
    </DashboardLayout>
  );
}
