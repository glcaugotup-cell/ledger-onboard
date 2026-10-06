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

const STATUS = {
  APPROVED: { tone: 'green', label: 'Shown' },
  PENDING: { tone: 'yellow', label: 'Waiting (older review)' },
  HIDDEN: { tone: 'red', label: 'Hidden' },
  REJECTED: { tone: 'red', label: 'Hidden' },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'shown', label: 'Shown', match: (r) => r.status === 'APPROVED' },
  { key: 'hidden', label: 'Hidden', match: (r) => ['HIDDEN', 'REJECTED'].includes(r.status) },
  { key: 'waiting', label: 'Waiting', match: (r) => r.status === 'PENDING' },
];

/**
 * Tenant reviews are published right away. The admin can hide one that breaks the rules
 * (the tenant and landlord are told), restore it later, and publish older reviews that
 * were still waiting for approval.
 */
export default function ReviewModerationPage() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [hiding, setHiding] = useState(null); // review id awaiting an optional reason

  const load = () => {
    setLoading(true);
    ReviewApi.listAll()
      .then(({ reviews: list }) => setReviews(list))
      .catch(() => setError('Could not load reviews.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (id, status, reason) => {
    setBusyId(id);
    setError('');
    try {
      await ReviewApi.moderate(id, { status, reason });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const activeFilter = FILTERS.find((f) => f.key === filter);
  const shown = activeFilter.match ? reviews.filter(activeFilter.match) : reviews;

  return (
    <DashboardLayout>
      <PageHeader title="Review moderation" description="Tenant reviews appear on property pages right away. Hide any that break the rules; you can restore them later." />
      <ErrorBanner message={error} />
      <div role="tablist" aria-label="Filter reviews" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`min-h-9 rounded-full px-3 text-sm font-semibold ${filter === f.key ? 'bg-brand-600 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {loading && <LoadingState label="Loading reviews…" />}
      {!loading && shown.length === 0 && !error && (
        <EmptyState icon={StarIcon} title="No reviews here" description="Tenant reviews appear here as soon as they are posted." />
      )}
      <div className="space-y-3">
        {shown.map((r) => {
          const state = STATUS[r.status] || STATUS.APPROVED;
          const isHidden = ['HIDDEN', 'REJECTED'].includes(r.status);
          return (
            <Card key={r._id}>
              <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{r.tenantId?.fullName} — {r.propertyId?.propertyName}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {r.createdAt && <span>Posted {formatDate(r.createdAt)}</span>}
                    {r.editedAt && <span>· Edited {formatDate(r.editedAt)}</span>}
                    <Badge tone={state.tone}>{state.label}</Badge>
                    {r.isVerifiedFormerTenant && <Badge tone="green">Verified former tenant</Badge>}
                  </p>
                </div>
                <span className="text-lg leading-none text-amber-500" role="img" aria-label={`${r.rating} out of 5 stars`}>
                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                </span>
              </div>
              {r.comment && <blockquote className="mb-3 border-l-2 border-gray-200 pl-3 text-sm text-gray-700">{r.comment}</blockquote>}
              {isHidden && r.moderationReason && <p className="mb-3 text-xs text-red-700">Hidden: {r.moderationReason}</p>}
              <div className="flex flex-wrap gap-2">
                {r.status === 'PENDING' && (
                  <Button loading={busyId === r._id} onClick={() => act(r._id, 'APPROVED')}>Publish</Button>
                )}
                {isHidden ? (
                  <Button variant="secondary" loading={busyId === r._id} onClick={() => act(r._id, 'APPROVED')}>Restore</Button>
                ) : (
                  <Button variant="ghost" loading={busyId === r._id} onClick={() => setHiding(r._id)}>Hide</Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
      {hiding && (
        <ReasonDialog
          open
          title="Hide this review?"
          message="It will be removed from the property page. The tenant and the landlord are notified. You can add a reason (optional) and restore it later."
          required={false}
          confirmLabel="Hide review"
          onConfirm={(reason) => {
            const id = hiding;
            setHiding(null);
            act(id, 'HIDDEN', reason || undefined);
          }}
          onCancel={() => setHiding(null)}
        />
      )}
    </DashboardLayout>
  );
}
