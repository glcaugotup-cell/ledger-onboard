import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import ReviewApi from '../../services/ReviewApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ReasonDialog from '../../components/ReasonDialog.jsx';
import { EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

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
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Review moderation</h1>
      <ErrorBanner message={error} />
      {loading && <LoadingState />}
      {!loading && reviews.length === 0 && <EmptyState title="Nothing pending review" />}
      <div className="space-y-3">
        {reviews.map((r) => (
          <Card key={r._id}>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium text-gray-900">{r.tenantId?.fullName} — {r.propertyId?.propertyName}</p>
              <span className="text-yellow-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
            </div>
            {r.comment && <p className="mb-3 text-sm text-gray-600">{r.comment}</p>}
            <div className="flex gap-2">
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
