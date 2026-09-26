import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import CaretakerApi from '../../services/CaretakerApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

const STATUS_TONE = { pending: 'yellow', approved: 'green', rejected: 'red', cancelled: 'gray', completed: 'blue' };

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
  const others = reservations.filter((r) => r.status !== 'pending');

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Reservations</h1>
      <ErrorBanner message={error} />
      {loading && <LoadingState />}

      {!loading && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Pending requests</h2>
          {pending.length === 0 && <EmptyState title="No pending requests" />}
          <div className="mb-8 space-y-3">
            {pending.map((r) => (
              <Card key={r._id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{r.tenantId?.fullName}</p>
                    <p className="text-sm text-gray-500">{r.propertyId?.propertyName} — Room {r.roomId?.roomNumber}</p>
                    <p className="text-xs text-gray-400">Move-in: {new Date(r.moveInDate).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={assignments[r._id] || ''}
                      onChange={(e) => setAssignments({ ...assignments, [r._id]: e.target.value })}
                      className="w-48"
                    >
                      <option value="" disabled hidden>Assign caretaker (optional)</option>
                      <CaretakerOptions caretakers={caretakers} barangay={r.propertyId?.address?.barangay} />

                    </Select>
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
              </Card>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">History</h2>
          <div className="space-y-2">
            {others.map((r) => (
              <Card key={r._id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{r.tenantId?.fullName}</p>
                    <p className="text-sm text-gray-500">{r.propertyId?.propertyName} — Room {r.roomId?.roomNumber}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>
                    {r.status === 'approved' && (
                      <Button variant="secondary" loading={busyId === r._id} onClick={() => act(r._id, 'completed')}>
                        Mark completed
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
