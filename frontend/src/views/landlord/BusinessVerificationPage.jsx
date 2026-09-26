import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import LandlordVerificationApi from '../../services/LandlordVerificationApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Badge, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';

const ACCEPTED_TYPES = 'image/png,image/jpeg,image/webp,application/pdf';
const MAX_DOCUMENT_MB = 5;

/** Drag-and-drop (or click-to-browse) upload zone for one required document. Purely presentational — every pick, whether dropped or chosen, still goes through the same `onFileChange` state setter the page already had. */
function DocumentUploadCard({ label, file, onFileChange, inputId }) {
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState('');

  // Same rules as the server's upload filter: PDF/JPG/PNG/WebP, 5 MB. Rejected picks never replace the current file.
  function pick(fileList) {
    const picked = fileList?.[0] || null;
    if (picked && !ACCEPTED_TYPES.split(',').includes(picked.type)) {
      setFileError('Only PDF, JPG, PNG or WebP files are accepted.');
      return;
    }
    if (picked && picked.size > MAX_DOCUMENT_MB * 1024 * 1024) {
      setFileError(`The file must be ${MAX_DOCUMENT_MB} MB or smaller.`);
      return;
    }
    setFileError('');
    onFileChange(picked);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <DocumentTextIcon className="h-5 w-5" />
        </span>
        <div>
          <p className="font-semibold text-gray-900">{label}</p>
          <p className="text-xs font-medium text-amber-600">Current Year required</p>
        </div>
      </div>

      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          pick(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragActive ? 'border-brand-400 bg-brand-50/60' : file ? 'border-brand-200 bg-brand-50/30' : 'border-gray-200 bg-gray-50/60 hover:border-brand-300'
        }`}
      >
        {file ? <CheckCircleIcon className="h-6 w-6 text-brand-600" /> : <ArrowUpTrayIcon className="h-6 w-6 text-brand-500" />}
        {file ? (
          <p className="max-w-full truncate text-sm font-medium text-gray-800">{file.name}</p>
        ) : (
          <p className="text-sm text-gray-500">Drag and drop your file here, or</p>
        )}
        <Button type="button" className="text-xs">
          Choose file
        </Button>
        <input id={inputId} type="file" accept={ACCEPTED_TYPES} className="hidden" onChange={(e) => pick(e.target.files)} />
        <p className="text-xs text-gray-400">Accepted formats: PDF, JPG, PNG (Max 5MB)</p>
      </label>
      {fileError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {fileError}
        </p>
      )}

      <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
        <LockClosedIcon className="h-3.5 w-3.5" /> Your document will be kept private and secure.
      </p>
    </div>
  );
}

function RequirementRow({ label, done }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? <CheckCircleIcon className="h-4 w-4 shrink-0 text-brand-600" /> : <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-gray-300" />}
      <span className={done ? 'text-gray-700' : 'text-gray-500'}>{label}</span>
    </div>
  );
}

function Step({ number, icon: Icon, title, description }) {
  return (
    <div className="flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:text-center">
      <div className="flex shrink-0 items-center gap-2 sm:flex-col">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[11px] font-bold text-white">{number}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600 sm:mt-1">
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </div>
  );
}

export default function BusinessVerificationPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [permit, setPermit] = useState(null);
  const [bir, setBir] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    LandlordVerificationApi.getMine()
      .then(({ submission: s }) => setSubmission(s))
      .catch(() => setError('Could not load your verification status.'))
      .finally(() => setLoading(false));
  }, []);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!permit || !bir) {
      setError("Both the Mayor's/Business Permit and BIR Form 2303 are required.");
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('mayorBusinessPermit', permit);
      fd.append('birForm2303', bir);
      const { submission: s } = await LandlordVerificationApi.submit(fd);
      setSubmission(s);
      setSuccess('Documents submitted for review.');
      await refreshProfile();
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  const status = user?.businessVerificationStatus;
  const needsSubmission = status !== 'VERIFIED' && status !== 'PENDING';
  const documentsRemaining = (permit ? 0 : 1) + (bir ? 0 : 1);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <ShieldCheckIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">Business Verification</h1>
            <p className="mt-0.5 text-sm text-gray-500">Complete your business verification to build trust with future tenants.</p>
          </div>
        </div>

        <div className={error ? 'mb-4' : undefined}>
          <ErrorBanner message={error} />
        </div>
        <div className={success ? 'mb-4' : undefined}>
          <SuccessBanner message={success} />
        </div>

        {loading && <LoadingState />}

        {!loading && status === 'VERIFIED' && (
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50 text-green-600">
                <CheckCircleIcon className="h-6 w-6" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">✓ Verified</Badge>
                <p className="text-sm text-gray-600">Your business is verified. You can upload and publish boarding houses.</p>
              </div>
            </div>
          </Card>
        )}

        {!loading && status === 'PENDING' && (
          <Card>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-yellow-50 text-yellow-600">
                <MagnifyingGlassIcon className="h-6 w-6" />
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="yellow">Pending review</Badge>
                <p className="text-sm text-gray-600">Your submitted documents are awaiting admin review.</p>
              </div>
            </div>
          </Card>
        )}

        {!loading && needsSubmission && (
          <form onSubmit={onSubmit} className="space-y-5">
            {status === 'REJECTED' && submission?.rejectionReason ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Verification rejected</p>
                  <p className="text-sm text-red-700">{submission.rejectionReason}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
                <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">Verification required</p>
                  <p className="text-sm text-amber-700">Complete your business verification before uploading or publishing boarding houses.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <DocumentUploadCard label="Mayor's / Business Permit" file={permit} onFileChange={setPermit} inputId="verification-permit" />
              <DocumentUploadCard label="BIR Form 2303" file={bir} onFileChange={setBir} inputId="verification-bir" />
            </div>

            <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <DocumentTextIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-gray-900">
                    {documentsRemaining > 0 ? `${documentsRemaining} document${documentsRemaining !== 1 ? 's' : ''} required` : 'All documents ready'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {documentsRemaining > 0 ? 'Please upload both documents to submit for review.' : 'You can now submit these documents for review.'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 sm:mx-2">
                <RequirementRow label="Mayor's / Business Permit" done={!!permit} />
                <RequirementRow label="BIR Form 2303" done={!!bir} />
              </div>

              <Button type="submit" loading={submitting} disabled={!permit || !bir} className="sm:shrink-0">
                {status === 'REJECTED' ? 'Resubmit documents' : 'Submit for Review'}
              </Button>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-4 py-3 text-xs text-gray-500">
              <LockClosedIcon className="h-4 w-4 shrink-0 text-gray-400" />
              Your documents are private and can only be viewed by authorized Ledger OnBoard administrators.
            </div>
          </form>
        )}

        {!loading && needsSubmission && (
          <Card className="mt-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <div className="flex-1">
                <h2 className="mb-4 text-base font-semibold text-gray-900">What happens next?</h2>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <Step number={1} icon={ArrowUpTrayIcon} title="Upload documents" description="Submit your business documents for verification." />
                  <div className="hidden items-center justify-center px-1 pt-4 text-gray-300 sm:flex">
                    <ArrowRightIcon className="h-4 w-4" />
                  </div>
                  <Step number={2} icon={MagnifyingGlassIcon} title="Admin review" description="Our team will verify your documents and business details." />
                  <div className="hidden items-center justify-center px-1 pt-4 text-gray-300 sm:flex">
                    <ArrowRightIcon className="h-4 w-4" />
                  </div>
                  <Step number={3} icon={ShieldCheckIcon} title="Verified & ready to publish" description="Once approved, you can upload and publish your boarding houses." />
                </div>
              </div>

              <div className="flex shrink-0 items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 p-4 lg:w-72">
                <InformationCircleIcon className="h-5 w-5 shrink-0 text-brand-600" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Important</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Landlords cannot upload or publish boarding houses until their business verification is approved by our admin team.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        <button
          type="button"
          onClick={() => navigate('/landlord/dashboard')}
          className="mt-6 flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Back to Dashboard
        </button>
      </div>
    </DashboardLayout>
  );
}
