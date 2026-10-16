import { useEffect, useRef, useState } from 'react';
import { AcademicCapIcon, CalendarDaysIcon, CheckIcon, ExclamationTriangleIcon, EyeIcon, IdentificationIcon, LockClosedIcon, UserIcon, XMarkIcon } from '@heroicons/react/24/outline';
import AdminApi from '../../services/AdminApi.js';
import StudentVerificationApi from '../../services/StudentVerificationApi.js';
import Button from '../../components/ui/Button.jsx';
import ReasonDialog from '../../components/ReasonDialog.jsx';
import DocumentPreviewDialog from '../../components/DocumentPreviewDialog.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { Badge, EmptyState, LoadingState } from '../../components/ui/Feedback.jsx';
import { formatDateTime } from '../../utils/format.js';
import { describeApiError } from '../../utils/errors.js';
import { lastValidDay } from '../../utils/studentId.js';

const SIDES = [
  { side: 'front', title: 'Front of ID' },
  { side: 'back', title: 'Back of ID' },
];

const REJECTION_REASONS = [
  'The photo is blurry or hard to read',
  'The name does not match the account',
  'The school or the years do not match the ID',
  'This is not a school ID',
];

/** One student's submission: their details, both photos, the years, and Approve / Reject. */
function StudentSubmissionCard({ submission: s, busy, viewingKey, error, onView, onApprove, onReject }) {
  // The admin can correct the last valid year if the student typed it wrong but the photo is clear.
  const [untilYear, setUntilYear] = useState(String(s.validUntilYear));
  const name = s.tenantId?.fullName || 'Student';
  const corrected = Number(untilYear) !== s.validUntilYear;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-amber-100 bg-amber-50 px-5 py-4">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-amber-800">Pending Review</p>
          <p className="text-sm text-amber-700">Check that the photos are a school ID for this student and that the school and years match what is printed on it.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
            <UserIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-gray-900">{name}</p>
            <p className="text-sm text-gray-500">{s.tenantId?.email}</p>
            <Badge tone="brand">Student</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 sm:border-l sm:border-gray-100 sm:pl-6">
          <AcademicCapIcon className="h-5 w-5 shrink-0 text-gray-400" />
          <div>
            <p className="font-medium text-gray-800">{s.school}</p>
            <p className="text-gray-500">Valid {s.validFromYear} – {s.validUntilYear}</p>
          </div>
        </div>
        {s.submittedAt && (
          <div className="flex items-center gap-2 text-sm text-gray-600 sm:border-l sm:border-gray-100 sm:pl-6">
            <CalendarDaysIcon className="h-5 w-5 shrink-0 text-gray-400" />
            <div>
              <p className="font-medium text-gray-800">Submitted On</p>
              <p className="text-gray-500">{formatDateTime(s.submittedAt)}</p>
              {s.documentsUpdatedAt && <p className="text-xs font-medium text-amber-700">Photos updated {formatDateTime(s.documentsUpdatedAt)}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-2">
        <p className="pt-2 text-sm font-semibold text-gray-900">ID photos</p>
        {SIDES.map((d) => (
          <div key={d.side} className="flex items-center justify-between gap-3 border-b border-gray-100 py-3 last:border-b-0">
            <p className="flex items-center gap-2 font-medium text-gray-900">
              <IdentificationIcon className="h-5 w-5 text-brand-600" aria-hidden="true" />
              {d.title}
            </p>
            <Button type="button" variant="secondary" loading={viewingKey === `${s._id}:${d.side}`} onClick={() => onView(s._id, d.side, `${d.title} — ${name}`)} className="gap-1.5" aria-label={`View ${d.title} of ${name}`}>
              <EyeIcon className="h-4 w-4" /> View
            </Button>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 px-5 py-4">
        <Field label="Last valid year" hint={corrected ? `Corrected from ${s.validUntilYear}. The ID will count until ${lastValidDay(untilYear)}.` : `The ID counts until ${lastValidDay(s.validUntilYear)}. Change the year if the student typed it wrong.`} className="sm:max-w-xs">
          <TextInput inputMode="numeric" maxLength={4} value={untilYear} onChange={(e) => setUntilYear(e.target.value.replace(/\D/g, ''))} aria-label={`Last valid year for ${name}`} />
        </Field>
        {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 bg-gray-50 px-5 py-4">
        <Button variant="danger" loading={busy} onClick={() => onReject(s._id)} className="gap-1.5" aria-label={`Reject ${name}`}>
          <XMarkIcon className="h-4 w-4" /> Reject
        </Button>
        <Button loading={busy} disabled={!/^\d{4}$/.test(untilYear)} onClick={() => onApprove(s._id, corrected ? Number(untilYear) : undefined)} className="gap-1.5" aria-label={`Approve ${name}`}>
          <CheckIcon className="h-4 w-4" /> Approve
        </Button>
      </div>
    </div>
  );
}

/** The Students tab of the admin Verifications page. `onChanged` reloads the list after a decision. */
export default function StudentVerificationReview({ submissions, loading, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const [errors, setErrors] = useState({}); // per submission
  const [rejecting, setRejecting] = useState(null);
  const [preview, setPreview] = useState(null);
  const [viewingKey, setViewingKey] = useState(null);

  // Shown inside the page first, with a button to open it in a new tab (like landlord documents).
  const viewPhoto = async (id, side, title) => {
    setViewingKey(`${id}:${side}`);
    setErrors((e) => ({ ...e, [id]: '' }));
    try {
      const { url, type } = await StudentVerificationApi.fetchDocument(id, side);
      setPreview({ url, type, title });
    } catch {
      setErrors((e) => ({ ...e, [id]: 'Could not load that photo.' }));
    } finally {
      setViewingKey(null);
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  // Frees the last loaded photo if the admin leaves with the preview open.
  const previewUrlRef = useRef(null);
  useEffect(() => {
    previewUrlRef.current = preview?.url || null;
  }, [preview]);
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const act = async (id, payload) => {
    setBusyId(id);
    setErrors((e) => ({ ...e, [id]: '' }));
    try {
      await AdminApi.reviewStudentVerification(id, payload);
      onChanged();
    } catch (err) {
      setErrors((e) => ({ ...e, [id]: describeApiError(err).message }));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {loading && <LoadingState />}
      {!loading && submissions.length === 0 && <EmptyState title="No student IDs waiting for review" />}
      {!loading && submissions.length > 0 && (
        <div className="space-y-5">
          {submissions.map((s) => (
            <StudentSubmissionCard
              key={s._id}
              submission={s}
              busy={busyId === s._id}
              viewingKey={viewingKey}
              error={errors[s._id]}
              onView={viewPhoto}
              onApprove={(id, validUntilYear) => act(id, { approve: true, ...(validUntilYear ? { validUntilYear } : {}) })}
              onReject={setRejecting}
            />
          ))}
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <LockClosedIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">ID photos are private</p>
              <p className="text-xs text-gray-500">Only the student and Ledger OnBoard administrators can open them. Landlords see only the school and until when the ID is valid.</p>
            </div>
          </div>
        </div>
      )}
      <DocumentPreviewDialog preview={preview} onClose={closePreview} />
      {rejecting && (
        <ReasonDialog
          open
          title="Reject this school ID?"
          message="The student sees your reason in the app and can upload their ID again."
          reasons={REJECTION_REASONS}
          confirmLabel="Reject ID"
          onConfirm={(reason) => {
            const id = rejecting;
            setRejecting(null);
            act(id, { approve: false, rejectionReason: reason });
          }}
          onCancel={() => setRejecting(null)}
        />
      )}
    </>
  );
}
