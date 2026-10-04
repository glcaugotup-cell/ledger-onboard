import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRightOnRectangleIcon, EnvelopeIcon, HomeModernIcon, MapPinIcon, PhoneIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import PropertyImage from '../../components/PropertyImage.jsx';
import { ReviewPrompt } from '../../components/ReviewForm.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { Field, TextArea } from '../../components/ui/Field.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import { BillingSection } from './MyBillingPage.jsx';
import { MaintenanceIssuesContent } from '../shared/MaintenanceIssuesPage.jsx';
import { formatDate } from '../../utils/format.js';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst } from '../../utils/textFormat.js';

const TABS = [
  { key: 'billing', label: 'Billing' },
  { key: 'issues', label: 'Maintenance issues' },
];

/** The current stay: where, who to contact, and the request-to-leave flow. */
function CurrentStay({ stay, onChanged }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const property = stay.propertyId || {};
  const landlord = stay.landlordContact;
  const caretaker = stay.caretakerContact;
  const leave = stay.leaveRequest;

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      await ReservationApi.requestLeave(stay._id, note.trim());
      setOpen(false);
      setMessage('Your request to leave was sent. Your landlord will review it.');
      await onChanged();
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col sm:flex-row">
        <PropertyImage property={property} className="h-36 w-full shrink-0 sm:h-auto sm:w-52" />
        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-5">
          <SuccessBanner message={message} />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-gray-900">{property.propertyName}</p>
              <p className="text-sm text-gray-600">Room {stay.roomId?.roomNumber}</p>
              {property.address?.barangay && <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500"><MapPinIcon className="h-4 w-4" aria-hidden="true" />{[property.address.street, property.address.barangay].filter(Boolean).join(', ')}</p>}
            </div>
            <Badge tone="green">Current stay since {formatDate(stay.movedInAt || stay.moveInDate)}</Badge>
          </div>
          {landlord && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Landlord</p>
              <p className="mt-0.5 font-medium">{landlord.fullName}</p>
              <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">
                {landlord.phone && <a href={`tel:${landlord.phone}`} className="inline-flex items-center gap-1.5 text-brand-700 hover:underline"><PhoneIcon className="h-4 w-4" aria-hidden="true" />{landlord.phone}</a>}
                {landlord.email && <a href={`mailto:${landlord.email}`} className="inline-flex min-w-0 items-center gap-1.5 truncate text-brand-700 hover:underline"><EnvelopeIcon className="h-4 w-4 shrink-0" aria-hidden="true" />{landlord.email}</a>}
              </div>
              {caretaker && <p className="mt-1.5 text-xs text-gray-500">Caretaker: {caretaker.fullName}{caretaker.phone ? ` · ${caretaker.phone}` : ''}</p>}
            </div>
          )}
          {leave?.status === 'pending' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">You asked to leave on {formatDate(leave.requestedAt)}. Waiting for your landlord to respond.</p>}
          {leave?.status === 'approved' && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">Your landlord approved your request to leave. They will mark you as moved out once you have left.</p>}
          {leave?.status === 'declined' && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Your request to leave was declined: {leave.declineReason}</p>}
          {leave?.status !== 'pending' && leave?.status !== 'approved' && (
            <div>
              <Button variant="secondary" onClick={() => { setError(''); setNote(''); setOpen(true); }}>
                <ArrowRightOnRectangleIcon className="h-4 w-4" aria-hidden="true" />Request to leave
              </Button>
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={open}
        title="Request to leave this apartment?"
        message="Your landlord will review the request. Any unpaid balance stays on record and still needs to be settled."
        confirmLabel="Send request"
        loading={loading}
        error={error}
        onConfirm={submit}
        onCancel={() => setOpen(false)}
      >
        <Field label="Message for your landlord">
          <TextArea rows={2} maxLength={500} value={note} onChange={(e) => setNote(capitalizeFirst(e.target.value))} placeholder="For example, your planned move-out date" />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

/**
 * R11: the tenant's apartment hub. The current stay at the top, then Billing and
 * Maintenance issues. Without a current stay, past bills, issues and stays stay
 * reachable read-only.
 */
export default function MyApartmentPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'issues' ? 'issues' : 'billing';
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () =>
    ReservationApi.list()
      .then(({ reservations: list }) => { setReservations(list); setError(''); })
      .catch(() => setError('Could not load your apartment.'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const current = reservations.find((r) => r.status === 'active');
  const pastStays = reservations.filter((r) => r.status === 'completed');
  const reserved = reservations.find((r) => r.status === 'approved');

  const selectTab = (key) => setSearchParams(key === 'billing' ? { tab: 'billing' } : { tab: key }, { replace: true });

  return (
    <DashboardLayout>
      <PageHeader title="My Apartment" description="Your current stay, bills and maintenance requests in one place." />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading your apartment…" />}
      {!loading && current && <CurrentStay stay={current} onChanged={load} />}
      {!loading && !current && (
        <div className="mb-6">
          <EmptyState
            icon={HomeModernIcon}
            title="No current stay"
            description={reserved
              ? `Your reservation at ${reserved.propertyId?.propertyName || 'your new place'} is approved. My Apartment opens once your landlord confirms your move-in. Past bills and issues stay below.`
              : 'Once a landlord confirms your move-in, your apartment, bills and maintenance requests appear here. Past bills and issues stay below.'}
            action={<Link to={reserved ? '/tenant/reservations' : '/tenant/discover'}><Button variant="secondary">{reserved ? 'View my reservation' : 'Discover boarding houses'}</Button></Link>}
          />
        </div>
      )}

      {!loading && (
        <>
          <div role="tablist" aria-label="My Apartment sections" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1">
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={tab === item.key}
                onClick={() => selectTab(item.key)}
                className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${tab === item.key ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === 'billing' ? <BillingSection highlightBillId={searchParams.get('bill')} /> : <MaintenanceIssuesContent embedded highlightIssueId={searchParams.get('issue')} />}
          </div>

          {pastStays.length > 0 && (
            <section aria-labelledby="past-stays-heading" className="mt-8">
              <h2 id="past-stays-heading" className="mb-3 text-base font-semibold text-gray-900">Past stays</h2>
              <div className="space-y-2">
                {pastStays.map((stay) => (
                  <Card key={stay._id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{stay.propertyId?.propertyName} · Room {stay.roomId?.roomNumber}</p>
                        <p className="text-xs text-gray-500">{formatDate(stay.movedInAt || stay.moveInDate)} – {formatDate(stay.movedOutAt || stay.updatedAt)}</p>
                      </div>
                      <Badge tone="gray">Moved out</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <ReviewPrompt />
    </DashboardLayout>
  );
}
