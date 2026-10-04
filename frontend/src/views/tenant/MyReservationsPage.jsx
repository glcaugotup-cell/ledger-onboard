import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDaysIcon, EnvelopeIcon, MapPinIcon, PhoneIcon, UserIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import PropertyImage from '../../components/PropertyImage.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { ReviewPrompt } from '../../components/ReviewForm.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import Button from '../../components/ui/Button.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { formatDate } from '../../utils/format.js';
import { describeApiError } from '../../utils/errors.js';
import { CANCELLABLE_STATUSES, HELD_STATUSES, RESERVATION_TONE, reservationLabel } from '../../utils/reservationStatus.js';

const STATUS_NOTE = {
  pending: 'Waiting for the landlord to respond.',
  completed: 'Your stay here has ended.',
  cancelled: 'This request was cancelled.',
  no_show: 'You did not arrive within the hold period, so the room was released.',
};

/** "Move in on Oct 20, 2026" (reserved) or "Current stay since Oct 20, 2026". */
function stayNote(r) {
  if (r.status === 'approved') return `Reserved: you may move in on ${formatDate(r.moveInDate)}.${r.holdUntil ? ` Your room is held until ${formatDate(`${r.holdUntil}T00:00:00`)}.` : ''}`;
  if (r.status === 'active') return `Current stay since ${formatDate(r.movedInAt || r.moveInDate)}.`;
  return null;
}

function ContactLine({ icon: Icon, children, href }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
      {href ? <a href={href} className="truncate text-brand-700 hover:underline">{children}</a> : <span className="truncate">{children}</span>}
    </span>
  );
}

/** R8: the landlord's name on every card; email and phone only once the reservation is approved. */
function Contacts({ reservation }) {
  const landlord = reservation.landlordContact;
  const caretaker = reservation.caretakerContact;
  if (!landlord) return null;
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Landlord</p>
      <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-4">
        <ContactLine icon={UserIcon}>{landlord.fullName}</ContactLine>
        {landlord.phone && <ContactLine icon={PhoneIcon} href={`tel:${landlord.phone}`}>{landlord.phone}</ContactLine>}
        {landlord.email && <ContactLine icon={EnvelopeIcon} href={`mailto:${landlord.email}`}>{landlord.email}</ContactLine>}
      </div>
      {caretaker && (
        <p className="mt-1.5 text-xs text-gray-500">Caretaker: {caretaker.fullName}{caretaker.phone ? ` · ${caretaker.phone}` : ''}</p>
      )}
    </div>
  );
}

export default function MyReservationsPage() {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('reservation');
  const reviewId = searchParams.get('review');
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cancelling, setCancelling] = useState(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');

  const load = () =>
    ReservationApi.list()
      .then(({ reservations: list }) => setReservations(list))
      .catch(() => setError('Could not load your reservations.'))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!highlightId || loading) return;
    document.getElementById(`reservation-${highlightId}`)?.scrollIntoView?.({ block: 'center' });
  }, [highlightId, loading]);

  const confirmCancel = async () => {
    setCancelLoading(true);
    setCancelError('');
    try {
      await ReservationApi.cancel(cancelling._id);
      setMessage('Your reservation was cancelled. The landlord has been notified.');
      setCancelling(null);
      await load();
    } catch (err) {
      setCancelError(describeApiError(err).message);
    } finally {
      setCancelLoading(false);
    }
  };

  // R9: the reserved or current stay stays pinned on top, so newer requests never push it down.
  const pinned = reservations.filter((r) => HELD_STATUSES.includes(r.status));
  const others = reservations.filter((r) => !HELD_STATUSES.includes(r.status));

  const card = (r, isPinned) => {
    const property = r.propertyId || {};
    const note = stayNote(r) || STATUS_NOTE[r.status];
    return (
      <div
        key={r._id}
        id={`reservation-${r._id}`}
        className={`flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm sm:flex-row ${isPinned ? 'border-brand-300 ring-1 ring-brand-100' : 'border-gray-200'} ${highlightId === r._id ? 'ring-2 ring-amber-300' : ''}`}
      >
        <PropertyImage property={property} className="h-32 w-full shrink-0 sm:h-auto sm:w-44" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">{property.propertyName}</p>
              <p className="text-sm text-gray-600">Room {r.roomId?.roomNumber}</p>
            </div>
            <Badge tone={RESERVATION_TONE[r.status] || 'gray'}>{reservationLabel(r.status)}</Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDaysIcon className="h-4 w-4" aria-hidden="true" />
              Move-in {formatDate(r.moveInDate)}
            </span>
            {property.address?.barangay && (
              <span className="inline-flex items-center gap-1">
                <MapPinIcon className="h-4 w-4" aria-hidden="true" />
                {property.address.barangay}
              </span>
            )}
          </div>
          {r.status === 'rejected' && r.rejectionReason ? (
            <p className="text-sm text-red-600">Reason: {r.rejectionReason}</p>
          ) : (
            note && <p className={`text-sm ${isPinned ? 'font-medium text-brand-800' : 'text-gray-500'}`}>{note}</p>
          )}
          {r.status === 'cancelled' && r.cancellationReason && <p className="text-xs text-gray-500">{r.cancellationReason}</p>}
          <Contacts reservation={r} />
          <div className="mt-auto flex flex-wrap items-center gap-3">
            {property._id && (
              <Link to={`/tenant/properties/${property._id}`} className="rounded text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                View property
              </Link>
            )}
            {r.status === 'active' && (
              <Link to="/tenant/apartment" className="rounded text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                Open My Apartment
              </Link>
            )}
            {CANCELLABLE_STATUSES.includes(r.status) && (
              <Button variant="secondary" className="ml-auto" onClick={() => { setCancelError(''); setCancelling(r); }}>
                Cancel reservation
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <PageHeader title="My reservations" description="Your room requests and stays." />
      <div className="space-y-3">
        <ErrorBanner message={error} />
        <SuccessBanner message={message} />
      </div>
      {loading && <LoadingState label="Loading your reservations…" />}
      {!loading && reservations.length === 0 && !error && (
        <EmptyState
          icon={CalendarDaysIcon}
          title="No reservations yet"
          description="Browse properties and request a room to get started."
          action={
            <Link to="/tenant/discover">
              <Button>Discover boarding houses</Button>
            </Link>
          }
        />
      )}
      {pinned.length > 0 && (
        <section aria-labelledby="pinned-heading" className="mb-6">
          <h2 id="pinned-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Your stay</h2>
          <div className="space-y-3">{pinned.map((r) => card(r, true))}</div>
        </section>
      )}
      {others.length > 0 && (
        <section aria-labelledby="others-heading">
          {pinned.length > 0 && <h2 id="others-heading" className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Other requests and past stays</h2>}
          <div className="space-y-3">{others.map((r) => card(r, false))}</div>
        </section>
      )}
      <ConfirmDialog
        open={Boolean(cancelling)}
        tone="danger"
        title="Cancel this reservation?"
        message={cancelling?.status === 'approved' ? 'Your reserved room will be released and the landlord will be notified.' : 'Your request will be withdrawn and the landlord will be notified.'}
        confirmLabel="Cancel reservation"
        cancelLabel="Keep it"
        loading={cancelLoading}
        error={cancelError}
        onConfirm={confirmCancel}
        onCancel={() => setCancelling(null)}
      />
      <ReviewPrompt focusReservationId={reviewId} />
    </DashboardLayout>
  );
}
