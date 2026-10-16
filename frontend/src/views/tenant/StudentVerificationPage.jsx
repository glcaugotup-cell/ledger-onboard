import { useEffect, useRef, useState } from 'react';
import {
  AcademicCapIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  IdentificationIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import StudentVerificationApi from '../../services/StudentVerificationApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import DocumentPreviewDialog from '../../components/DocumentPreviewDialog.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { Badge, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { OTHER_SCHOOL, STUDENT_SCHOOLS } from '../../data/studentSchools.js';
import { describeApiError } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { isStudentIdYearCurrent, lastValidDay, studentIdState } from '../../utils/studentId.js';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';
const MAX_PHOTO_MB = 5;
const MAX_VALIDITY_YEARS = 10;
const SIDES = [
  { side: 'front', field: 'idFront', label: 'Front of your ID' },
  { side: 'back', field: 'idBack', label: 'Back of your ID' },
];
const EMPTY_FORM = { school: '', otherSchool: '', validFromYear: '', validUntilYear: '' };

/** Same rules as the server's upload filter: JPG, PNG or WebP photos, 5 MB. '' when the file is fine. */
function photoError(file) {
  if (!ACCEPTED_TYPES.split(',').includes(file.type)) return 'Only JPG, PNG or WebP photos are accepted.';
  if (file.size > MAX_PHOTO_MB * 1024 * 1024) return `The photo must be ${MAX_PHOTO_MB} MB or smaller.`;
  return '';
}

/** Same checks as the server, so most mistakes show under their field before anything is sent. */
function validate(form, photos) {
  const errors = {};
  if (!photos.front) errors.idFront = 'Add a photo of the front of your ID.';
  if (!photos.back) errors.idBack = 'Add a photo of the back of your ID.';
  if (!form.school) errors.school = 'Choose your school.';
  else if (form.school === OTHER_SCHOOL && form.otherSchool.trim().length < 2) errors.otherSchool = 'Type the name of your school.';
  const from = Number(form.validFromYear);
  const until = Number(form.validUntilYear);
  const thisYear = new Date().getFullYear();
  if (!/^\d{4}$/.test(form.validFromYear) || from < 2000 || from > thisYear + 1) errors.validFromYear = 'Enter the first year printed on your ID, like 2024.';
  if (!/^\d{4}$/.test(form.validUntilYear) || until < 2000 || until > 2100) errors.validUntilYear = 'Enter the last year printed on your ID, like 2028.';
  else if (!errors.validFromYear && until < from) errors.validUntilYear = "The last year can't be before the first year.";
  else if (!errors.validFromYear && until - from > MAX_VALIDITY_YEARS) errors.validUntilYear = `A school ID is valid for at most ${MAX_VALIDITY_YEARS} years.`;
  else if (!isStudentIdYearCurrent(until)) errors.validUntilYear = `This ID was only valid until ${lastValidDay(until)}. Upload your current school ID.`;
  return errors;
}

/** One ID photo: pick or drop it, look at it (here or in a new tab) before sending, or remove it. */
function IdPhotoInput({ label, inputId, file, onChange, error }) {
  const inputRef = useRef(null);
  const [problem, setProblem] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // A rejected pick never replaces the current photo.
  function pick(picked) {
    const issue = picked ? photoError(picked) : '';
    setProblem(issue);
    if (issue) return;
    setPreviewOpen(false);
    setPreviewUrl(picked ? URL.createObjectURL(picked) : null);
    onChange(picked);
  }

  const message = problem || error;
  return (
    <div className={`rounded-xl border bg-white p-4 ${message ? 'border-red-300' : 'border-gray-200'}`}>
      <p className="mb-3 flex items-center gap-2 font-semibold text-gray-900">
        <IdentificationIcon className="h-5 w-5 text-brand-600" aria-hidden="true" />
        {label}
        <span className="text-red-600" aria-hidden="true">*</span>
      </p>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files?.[0] || null);
        }}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center ${file ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200 bg-gray-50/60'}`}
      >
        {file ? <CheckCircleIcon className="h-6 w-6 text-brand-600" /> : <ArrowUpTrayIcon className="h-6 w-6 text-brand-500" />}
        {file ? <p className="max-w-full truncate text-sm font-medium text-gray-800">{file.name}</p> : <p className="text-sm text-gray-500">Drag a photo here, or</p>}
        <Button type="button" className="text-xs" onClick={() => inputRef.current?.click()}>{file ? 'Replace photo' : 'Choose photo'}</Button>
        <input ref={inputRef} id={inputId} type="file" accept={ACCEPTED_TYPES} aria-label={label} className="hidden" onChange={(e) => { pick(e.target.files?.[0] || null); e.target.value = ''; }} />
        {file && (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" className="text-xs" onClick={() => setPreviewOpen(true)} aria-label={`View ${label}`}>View</Button>
            <Button type="button" variant="ghost" className="text-xs" onClick={() => pick(null)} aria-label={`Remove ${label}`}>Remove</Button>
          </div>
        )}
        <p className="text-xs text-gray-500">JPG, PNG or WebP, up to {MAX_PHOTO_MB} MB</p>
      </div>
      {message && <p className="mt-2 text-xs text-red-600" role="alert">{message}</p>}
      <ConfirmDialog open={previewOpen && Boolean(previewUrl)} title={label} cancelLabel="Close preview" confirmLabel="Open in new tab" onConfirm={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')} onCancel={() => setPreviewOpen(false)}>
        <img alt={`Preview of ${label}`} src={previewUrl || undefined} className="max-h-[60vh] w-full rounded-lg object-contain" />
      </ConfirmDialog>
    </div>
  );
}

/** The photos already sent: view each (here or in a new tab) and, while the review is pending, replace one. */
function SubmittedPhotos({ submission, canReplace, onReplaced, onMessage }) {
  const inputRefs = useRef({});
  const [busy, setBusy] = useState(null); // "view:<side>" or "replace:<side>"
  const [errors, setErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const previewUrlRef = useRef(null);
  useEffect(() => {
    previewUrlRef.current = preview?.url || null;
  }, [preview]);
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  const view = async ({ side, label }) => {
    setBusy(`view:${side}`);
    setErrors((e) => ({ ...e, [side]: '' }));
    try {
      const { url, type } = await StudentVerificationApi.fetchDocument(submission._id, side);
      setPreview({ url, type, title: label });
    } catch {
      setErrors((e) => ({ ...e, [side]: 'Could not load that photo.' }));
    } finally {
      setBusy(null);
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const replace = async ({ side, field, label }, file) => {
    if (!file) return;
    const issue = photoError(file);
    setErrors((e) => ({ ...e, [side]: issue }));
    if (issue) return;
    setBusy(`replace:${side}`);
    onMessage('');
    try {
      const fd = new FormData();
      fd.append(field, file);
      const { submission: updated } = await StudentVerificationApi.replaceDocuments(submission._id, fd);
      onReplaced(updated);
      onMessage(`${label} replaced. The admin will review the new photo.`);
    } catch (err) {
      setErrors((e) => ({ ...e, [side]: describeApiError(err).message }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="text-sm font-semibold text-gray-900">Your ID photos</p>
      {canReplace && <p className="text-xs text-gray-500">Sent the wrong photo? You can replace it until the admin reviews it.</p>}
      {submission.documentsUpdatedAt && <p className="mt-1 text-xs text-gray-500">Last updated {formatDateTime(submission.documentsUpdatedAt)}</p>}
      {SIDES.map((s) => (
        <div key={s.side} className="border-b border-gray-100 py-3 last:border-b-0">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
              <IdentificationIcon className="h-5 w-5 text-brand-600" aria-hidden="true" />
              {s.label}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="text-xs" loading={busy === `view:${s.side}`} disabled={Boolean(busy)} onClick={() => view(s)} aria-label={`View ${s.label}`}>View</Button>
              {canReplace && (
                <>
                  <Button type="button" variant="ghost" className="text-xs" loading={busy === `replace:${s.side}`} disabled={Boolean(busy)} onClick={() => inputRefs.current[s.side]?.click()} aria-label={`Replace ${s.label}`}>Replace photo</Button>
                  <input
                    ref={(el) => { inputRefs.current[s.side] = el; }}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    aria-label={`New photo for ${s.label}`}
                    className="hidden"
                    onChange={(e) => { replace(s, e.target.files?.[0]); e.target.value = ''; }}
                  />
                </>
              )}
            </div>
          </div>
          {errors[s.side] && <p className="mt-1 text-xs text-red-600" role="alert">{errors[s.side]}</p>}
        </div>
      ))}
      <DocumentPreviewDialog preview={preview} onClose={closePreview} />
    </div>
  );
}

function StatusCard({ tone, icon: Icon, badge, children }) {
  const iconTone = { green: 'bg-green-50 text-green-600', yellow: 'bg-yellow-50 text-yellow-600' }[tone];
  return (
    <div className="flex items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${iconTone}`}>
        <Icon className="h-6 w-6" />
      </span>
      <div>
        <Badge tone={tone}>{badge}</Badge>
        <div className="mt-1 text-sm text-gray-600">{children}</div>
      </div>
    </div>
  );
}

/**
 * Students verify their school ID here before they can reserve: front and back photos, the
 * school, and the years printed on the ID. An admin reviews it on the Verifications page.
 */
export default function StudentVerificationPage() {
  const { user, refreshProfile } = useAuth();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState({ front: null, back: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    StudentVerificationApi.getMine()
      .then(({ submission: s }) => setSubmission(s))
      .catch(() => setError('Could not load your verification status.'))
      .finally(() => setLoading(false));
    // The admin may have decided since this session loaded the profile.
    Promise.resolve(refreshProfile?.()).catch(() => {});
  }, [refreshProfile]);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined, ...(key === 'school' ? { otherSchool: undefined } : {}) }));
  };
  const setPhoto = (side, field) => (file) => {
    setPhotos((p) => ({ ...p, [side]: file }));
    setFieldErrors((e) => ({ ...e, [field]: undefined }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const errors = validate(form, photos);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError(Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Fix the ${Object.keys(errors).length} highlighted fields.`);
      return;
    }
    const school = form.school === OTHER_SCHOOL ? form.otherSchool.trim() : form.school;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('idFront', photos.front);
      fd.append('idBack', photos.back);
      fd.append('school', school);
      fd.append('validFromYear', form.validFromYear);
      fd.append('validUntilYear', form.validUntilYear);
      const { submission: s } = await StudentVerificationApi.submit(fd);
      setSubmission(s);
      setPhotos({ front: null, back: null });
      setForm(EMPTY_FORM);
      setSuccess('Your school ID was sent for review. You will get a notification when an admin decides.');
      await Promise.resolve(refreshProfile?.()).catch(() => {});
    } catch (err) {
      const { message, fieldErrors: server } = describeApiError(err);
      const mapped = { ...server, ...(server.school && form.school === OTHER_SCHOOL ? { otherSchool: server.school, school: undefined } : {}) };
      setFieldErrors(mapped);
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Right after submitting, the profile may not have caught up yet; the submission is the latest word.
  const state = submission?.status === 'PENDING' ? 'PENDING' : studentIdState(user);
  const needsSubmission = !['VERIFIED', 'PENDING'].includes(state);

  return (
    <DashboardLayout back={{ disabled: submitting }}>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <AcademicCapIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Student verification</h1>
            <p className="mt-0.5 text-sm text-gray-500">Ledger OnBoard is for students. Verify your school ID to reserve rooms.</p>
          </div>
        </div>

        <div className={error ? 'mb-4' : undefined}><ErrorBanner message={error} /></div>
        <div className={success ? 'mb-4' : undefined}><SuccessBanner message={success} /></div>

        {loading && <LoadingState />}

        {!loading && state === 'VERIFIED' && (
          <Card>
            <StatusCard tone="green" icon={CheckCircleIcon} badge="✓ Verified student">
              <p>{user?.studentSchool} · your ID counts until {lastValidDay(user?.studentIdValidUntilYear)}. You can reserve rooms.</p>
            </StatusCard>
            {submission && <SubmittedPhotos submission={submission} canReplace={false} onReplaced={setSubmission} onMessage={setSuccess} />}
          </Card>
        )}

        {!loading && state === 'PENDING' && (
          <Card>
            <StatusCard tone="yellow" icon={MagnifyingGlassIcon} badge="Waiting for review">
              <p>An admin is checking your school ID. You can reserve rooms once it is approved.</p>
              {submission && <p className="mt-1">{submission.school} · valid {submission.validFromYear} – {submission.validUntilYear}</p>}
            </StatusCard>
            {submission?.status === 'PENDING' && <SubmittedPhotos submission={submission} canReplace onReplaced={setSubmission} onMessage={setSuccess} />}
          </Card>
        )}

        {!loading && needsSubmission && (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <div className={`flex items-start gap-3 rounded-xl border px-4 py-3.5 ${state === 'REJECTED' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
              <ExclamationTriangleIcon className={`h-5 w-5 shrink-0 ${state === 'REJECTED' ? 'text-red-500' : 'text-amber-500'}`} />
              <div>
                {state === 'REJECTED' && (
                  <>
                    <p className="text-sm font-semibold text-red-800">Your school ID was not approved</p>
                    {submission?.rejectionReason && <p className="text-sm text-red-700">Reason: {submission.rejectionReason}</p>}
                    <p className="text-sm text-red-700">Fix the problem and upload your ID again below.</p>
                  </>
                )}
                {state === 'EXPIRED' && (
                  <>
                    <p className="text-sm font-semibold text-amber-800">Your student ID has expired</p>
                    <p className="text-sm text-amber-700">It was valid until {lastValidDay(user?.studentIdValidUntilYear)}. Upload your current school ID to reserve again. Your current stay is not affected.</p>
                  </>
                )}
                {state === 'NONE' && (
                  <>
                    <p className="text-sm font-semibold text-amber-800">Verification required</p>
                    <p className="text-sm text-amber-700">Upload your school ID before you can reserve a room. You can browse places in the meantime.</p>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SIDES.map((s) => (
                <IdPhotoInput key={s.side} label={s.label} inputId={`student-id-${s.side}`} file={photos[s.side]} onChange={setPhoto(s.side, s.field)} error={fieldErrors[s.field]} />
              ))}
            </div>

            <Card>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field required label="School" error={fieldErrors.school}>
                  <Select value={form.school} onChange={(e) => setField('school', e.target.value)} error={fieldErrors.school}>
                    <option value="">Choose your school…</option>
                    {STUDENT_SCHOOLS.map((name) => <option key={name} value={name}>{name}</option>)}
                    <option value={OTHER_SCHOOL}>Other (type the school name)</option>
                  </Select>
                </Field>
                {form.school === OTHER_SCHOOL && (
                  <Field required label="School name" error={fieldErrors.otherSchool}>
                    <TextInput value={form.otherSchool} maxLength={120} onChange={(e) => setField('otherSchool', e.target.value)} error={fieldErrors.otherSchool} />
                  </Field>
                )}
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field required label="Valid from (year)" hint="The first year printed on your ID, e.g. 2024" error={fieldErrors.validFromYear}>
                  <TextInput inputMode="numeric" maxLength={4} placeholder="2024" value={form.validFromYear} onChange={(e) => setField('validFromYear', e.target.value.replace(/\D/g, ''))} error={fieldErrors.validFromYear} />
                </Field>
                <Field required label="Valid until (year)" hint="The last year printed on your ID, e.g. 2028. It counts until May 31 of that year." error={fieldErrors.validUntilYear}>
                  <TextInput inputMode="numeric" maxLength={4} placeholder="2028" value={form.validUntilYear} onChange={(e) => setField('validUntilYear', e.target.value.replace(/\D/g, ''))} error={fieldErrors.validUntilYear} />
                </Field>
              </div>
              <div className="mt-5 flex justify-end">
                <Button type="submit" loading={submitting}>{state === 'NONE' ? 'Submit for review' : 'Submit again'}</Button>
              </div>
            </Card>

            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
              <LockClosedIcon className="h-4 w-4 shrink-0 text-gray-400" />
              Your ID photos are private. Only you and Ledger OnBoard administrators can open them; landlords only see your school and until when your ID is valid.
            </div>
          </form>
        )}
      </div>
    </DashboardLayout>
  );
}
