import { useEffect, useState } from 'react';
import {
  CalendarDaysIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  LockClosedIcon,
  ShieldCheckIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import AdminApi from '../../services/AdminApi.js';
import LandlordVerificationApi from '../../services/LandlordVerificationApi.js';
import Button from '../../components/ui/Button.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

function DocumentRow({ title, onView }) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-100 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <DocumentTextIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="font-medium text-gray-900">{title}</p>
          <p className="text-xs text-amber-600">Current Year Required</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1 text-sm font-medium text-green-600">
          <CheckCircleIcon className="h-4 w-4" /> Submitted
        </span>
        <Button type="button" variant="secondary" onClick={onView} className="gap-1.5">
          <EyeIcon className="h-4 w-4" /> View
        </Button>
      </div>
    </div>
  );
}

function SubmissionCard({ submission: s, busy, onView, onAct }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Pending Review</p>
          <p className="text-sm text-amber-700">This landlord has submitted their business documents. Please review and approve or reject their application.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <UserIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-gray-900">{s.landlordId?.fullName || 'Landlord'}</p>
            <p className="text-sm text-gray-500">{s.landlordId?.email}</p>
            <Badge tone="brand">Landlord</Badge>
          </div>
        </div>

        {s.submittedAt && (
          <div className="flex items-center gap-2 text-sm text-gray-600 sm:border-l sm:border-gray-100 sm:pl-6">
            <CalendarDaysIcon className="h-5 w-5 shrink-0 text-gray-400" />
            <div>
              <p className="font-medium text-gray-800">Submitted On</p>
              <p className="text-gray-500">{new Date(s.submittedAt).toLocaleString()}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm sm:border-l sm:border-gray-100 sm:pl-6">
          <ClockIcon className="h-5 w-5 shrink-0 text-gray-400" />
          <div>
            <p className="font-medium text-gray-800">Verification Status</p>
            <Badge tone="yellow">Pending Review</Badge>
          </div>
        </div>
      </div>

      <div className="px-5 py-2">
        <p className="pt-2 text-sm font-semibold text-gray-900">Submitted Documents</p>
        <DocumentRow title="Mayor's / Business Permit" onView={() => onView(s._id, 'permit')} />
        <DocumentRow title="BIR Form 2303" onView={() => onView(s._id, 'bir')} />
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
        <Button variant="danger" loading={busy} onClick={() => onAct(s._id, false)} className="gap-1.5">
          <XMarkIcon className="h-4 w-4" /> Reject
        </Button>
        <Button loading={busy} onClick={() => onAct(s._id, true)} className="gap-1.5">
          <CheckIcon className="h-4 w-4" /> Approve
        </Button>
      </div>
    </div>
  );
}

export default function LandlordVerificationPage() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    AdminApi.listPendingLandlordVerifications()
      .then(({ submissions: list }) => setSubmissions(list))
      .catch(() => setError('Could not load pending verifications.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const viewDocument = async (id, docType) => {
    try {
      const url = await LandlordVerificationApi.fetchDocumentObjectUrl(id, docType);
      window.open(url, '_blank');
    } catch {
      setError('Could not load that document.');
    }
  };

  const act = async (id, approve) => {
    const rejectionReason = !approve ? prompt('Reason for rejection?') || undefined : undefined;
    setBusyId(id);
    try {
      await AdminApi.reviewLandlordVerification(id, { approve, rejectionReason });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <ShieldCheckIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Landlord Business Verification</h1>
            <p className="mt-0.5 text-sm text-gray-500">Review and verify landlord business documents before they can upload or publish boarding houses.</p>
          </div>
        </div>

        <div className={error ? 'mb-4' : undefined}>
          <ErrorBanner message={error} />
        </div>

        {loading && <LoadingState />}
        {!loading && submissions.length === 0 && <EmptyState title="Nothing pending review" />}

        {!loading && submissions.length > 0 && (
          <div className="space-y-5">
            {submissions.map((s) => (
              <SubmissionCard key={s._id} submission={s} busy={busyId === s._id} onView={viewDocument} onAct={act} />
            ))}
          </div>
        )}

        {!loading && submissions.length > 0 && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LockClosedIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">Verification documents are private</p>
              <p className="text-xs text-gray-500">These documents are only accessible to authorized Ledger OnBoard administrators.</p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
