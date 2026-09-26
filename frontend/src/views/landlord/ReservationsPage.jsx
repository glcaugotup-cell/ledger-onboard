import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import CaretakerApi from '../../services/CaretakerApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../../components/ui/Feedback.jsx';
import { formatDate } from '../../utils/format.js';

const STATUS_TONE = { pending: 'yellow', approved: 'green', rejected: 'red', cancelled: 'gray', completed: 'blue' };

function SectionTitle({ id, count, children }) {
  return (
    <h2 id={id} className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
      {children}
      <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold normal-case tracking-normal text-gray-700">{count}</span>
    </h2>
  );
}

/** Caretakers who work in the property's barangay are listed first, under their own heading. */
function CaretakerOptions({ caretakers, barangay }) {
  const suitable = caretakers.filter((c) => barangay && c.serviceBarangay === barangay);
  const others = caretakers.filter((c) => !suitable.includes(c));
  const label = (c) => (c.serviceBarangay ? `${c.fullName} (works in ${c.serviceBarangay})` : c.fullName);
  if (suitable.length === 0) {
    return others.map((c) => (
      <option key={c._id} value={c._id}>
        {label(c)}
      </option>
    ));
  }
  return (
    <>
      <optgroup label={`Suitable — works in ${barangay}`}>
        {suitable.map((c) => (
          <option key={c._id} value={c._id}>
            {c.fullName}
          </option>
        ))}
      </optgroup>
      {others.length > 0 && (
        <optgroup label="Other caretakers">
          {others.map((c) => (
            <option key={c._id} value={c._id}>
              {label(c)}
            </option>
          ))}
        </optgroup>
      )}
    </>
  );
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [caretakers, setCaretakers] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([ReservationApi.list(), CaretakerApi.list()])
      .then(([r, c]) => {
        setReservations(r.reservations);
        setCaretakers(c.caretakers.filter((ct) => ct.accountStatus === 'active'));
      })
      .catch(() => setError('Could not load reservations.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (id, status, extra = {}) => {
    setBusyId(id);
    setError('');
    try {
      await ReservationApi.updateStatus(id, { status, ...extra });
      load();
    } catch (err) {
      setError(err.message || 'Could not update reservation.');
    } finally {
      setBusyId(null);
    }
  };

  const pending = reservations.filter((r) => r.status === 'pending');
  const current = reservations.filter((r) => r.status === 'approved');
  const past = reservations.filter((r) => !['pending', 'approved'].includes(r.status));

  const who = (r) => (
    <div className="min-w-0">
      <p className="font-semibold text-gray-900">{r.tenantId?.fullName}</p>
      <p className="text-sm text-gray-600">
        {r.propertyId?.propertyName} · Room {r.roomId?.roomNumber}
      </p>
      <p className="mt-0.5 text-xs text-gray-500">
        Move-in {formatDate(r.moveInDate)}
        {r.moveOutDate ? ` · Move-out ${formatDate(r.moveOutDate)}` : ''}
        {r.status === 'rejected' && r.rejectionReason ? ` · Reason: ${r.rejectionReason}` : ''}
      </p>
    </div>
  );

  return (
    <DashboardLayout>
      <PageHeader title="Reservations" description="Answer new requests and manage current tenancies." />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading reservations…" />}

      {!loading && (
        <div className="space-y-8">
          <section aria-labelledby="pending-heading">
            <SectionTitle id="pending-heading" count={pending.length}>
              Pending requests
            </SectionTitle>
            {pending.length === 0 && <EmptyState icon={CalendarDaysIcon} title="No pending requests" description="New reservation requests from tenants appear here." />}
            <div className="space-y-3">
              {pending.map((r) => (
                <Card key={r._id} className="border-l-4 border-l-amber-400">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    {who(r)}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Select
                        aria-label={`Assign a caretaker to ${r.tenantId?.fullName || 'this tenant'}`}
                        value={assignments[r._id] || ''}
                        onChange={(e) => setAssignments({ ...assignments, [r._id]: e.target.value })}
                        className="sm:w-60"
                      >
                        <option value="" disabled hidden>
                          Assign caretaker (optional)
                        </option>
                        <CaretakerOptions caretakers={caretakers} barangay={r.propertyId?.address?.barangay} />
                      </Select>
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Button
                          loading={busyId === r._id}
                          onClick={() => act(r._id, 'approved', assignments[r._id] ? { caretakerAssignedId: assignments[r._id] } : {})}
                        >
                          Approve
                        </Button>
                        <Button variant="danger" loading={busyId === r._id} onClick={() => act(r._id, 'rejected', { rejectionReason: 'Not a fit for this room' })}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="current-heading">
            <SectionTitle id="current-heading" count={current.length}>
              Current tenants
            </SectionTitle>
            {current.length === 0 && <p className="text-sm text-gray-500">No one is currently staying through an approved reservation.</p>}
            <div className="space-y-2">
              {current.map((r) => (
                <Card key={r._id}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {who(r)}
                    <div className="flex items-center justify-between gap-2 sm:justify-end">
                      <StatusBadge status={r.status} tones={STATUS_TONE} />
                      <Button variant="secondary" loading={busyId === r._id} onClick={() => act(r._id, 'completed')}>
                        Mark completed
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="history-heading">
            <SectionTitle id="history-heading" count={past.length}>
              History
            </SectionTitle>
            {past.length === 0 && <p className="text-sm text-gray-500">Completed, rejected and cancelled reservations appear here.</p>}
            <div className="space-y-2">
              {past.map((r) => (
                <Card key={r._id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    {who(r)}
                    <StatusBadge status={r.status} tones={STATUS_TONE} />
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </DashboardLayout>
  );
}
