import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { Badge, ErrorBanner, LoadingState, StatusBadge, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst } from '../../utils/textFormat.js';
import { formatPeso } from '../../utils/format.js';

const STATUS_TONE = { draft: 'gray', pending_moderation: 'yellow', approved: 'green', rejected: 'red', inactive: 'gray', available: 'green', occupied: 'red', maintenance: 'yellow' };

/** Same limits as backend/validators/roomValidators.js. */
function validateRoom({ roomNumber, capacity, monthlyBaseRent }) {
  const errors = {};
  if (!roomNumber.trim()) errors.roomNumber = 'Room number is required';
  else if (roomNumber.trim().length > 20) errors.roomNumber = 'Room number must be at most 20 characters';
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 50) errors.capacity = 'Capacity must be a whole number from 1 to 50';
  const rent = Number(monthlyBaseRent);
  if (monthlyBaseRent === '' || !Number.isFinite(rent) || !/^\d+(\.\d{1,2})?$/.test(monthlyBaseRent) || rent < 0 || rent > 1000000) {
    errors.monthlyBaseRent = 'Enter an amount from ₱0 to ₱1,000,000 with up to 2 decimal places';
  }
  return errors;
}

function AddRoomForm({ propertyId, onAdded }) {
  const [form, setForm] = useState({ roomNumber: '', capacity: '2', monthlyBaseRent: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const errors = validateRoom(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setLoading(true);
    try {
      const { room } = await PropertyApi.createRoom(propertyId, {
        roomNumber: form.roomNumber.trim(),
        capacity: Number(form.capacity),
        monthlyBaseRent: Number(form.monthlyBaseRent),
      });
      onAdded(room);
      setForm({ roomNumber: '', capacity: '2', monthlyBaseRent: '' });
    } catch (err) {
      const { message, fieldErrors: serverErrors } = describeApiError(err);
      setError(message || 'Could not add room.');
      setFieldErrors(serverErrors);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 rounded-xl border border-gray-100 bg-gray-50/70 p-4 sm:grid-cols-2 sm:items-end xl:grid-cols-4">
      <div className="sm:col-span-2 xl:col-span-4">
        <ErrorBanner message={error} />
      </div>
      <Field label="Room number" hint="Use a unique room label" error={fieldErrors.roomNumber}>
        <TextInput value={form.roomNumber} maxLength={20} onChange={(e) => setField('roomNumber', capitalizeFirst(e.target.value))} error={fieldErrors.roomNumber} />
      </Field>
      <Field label="Capacity" hint="1–50 occupants" error={fieldErrors.capacity}>
        <TextInput type="number" min="1" max="50" step="1" inputMode="numeric" value={form.capacity} onChange={(e) => setField('capacity', e.target.value)} error={fieldErrors.capacity} />
      </Field>
      <Field label="Rent per slot" hint="Monthly · up to ₱1,000,000 · 2 decimal places" error={fieldErrors.monthlyBaseRent}>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center rounded-l-lg border-r border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-gray-600">₱</span>
          <TextInput
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            maxLength={10}
            value={form.monthlyBaseRent}
            className="pl-12 tabular-nums"
            onChange={(e) => {
              const value = e.target.value;
              if (value === '' || (/^\d{1,7}(\.\d{0,2})?$/.test(value) && Number(value) <= 1000000)) setField('monthlyBaseRent', value);
            }}
            error={fieldErrors.monthlyBaseRent}
            aria-label="Monthly rent per slot in Philippine pesos"
          />
        </div>
      </Field>
      <div>
        <Button type="submit" loading={loading} className="w-full">
          Add room
        </Button>
      </div>
    </form>
  );
}

/**
 * The landlord's caretakers ranked by location: those who work in this property's
 * barangay are marked "Suitable" with the reason shown. Assigning always needs an
 * explicit confirmation.
 */
function CaretakerAssignment({ propertyId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [confirming, setConfirming] = useState(null); // caretaker awaiting confirmation
  const [removing, setRemoving] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState('');

  const load = () =>
    PropertyApi.listCaretakerSuggestions(propertyId)
      .then(setData)
      .catch((err) => setError(describeApiError(err).message || 'Could not load caretakers.'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const assign = async () => {
    setAssigning(true);
    setAssignError('');
    try {
      await PropertyApi.assignCaretaker(propertyId, confirming._id);
      setMsg(`${confirming.fullName} is now assigned to this property.`);
      setConfirming(null);
      await load();
    } catch (err) {
      setAssignError(describeApiError(err).message);
    } finally {
      setAssigning(false);
    }
  };

  const unassign = async () => {
    setAssigning(true);
    setAssignError('');
    try {
      await PropertyApi.unassignCaretaker(propertyId, removing._id);
      setMsg(`${removing.fullName} is no longer assigned to this property.`);
      setRemoving(null);
      await load();
    } catch (err) {
      setAssignError(describeApiError(err).message);
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Card title="Caretakers" className="mb-6">
      <ErrorBanner message={error} />
      <SuccessBanner message={msg} />
      {!data && !error && <p className="text-sm text-gray-500">Loading caretakers…</p>}
      {data && (
        <>
          <p className="mb-3 text-sm text-gray-500">
            This property is in <span className="font-medium text-gray-700">{data.propertyBarangay}</span>. Caretakers who work in the same barangay are
            suggested first.
          </p>
          {data.caretakers.length === 0 && (
            <p className="text-sm text-gray-500">You have no active caretakers yet. Invite one from the Caretakers page.</p>
          )}
          <ul className="space-y-2">
            {data.caretakers.map((c) => (
              <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
                    {c.fullName}
                    {c.suitable && <Badge tone="green">Suitable</Badge>}
                    {c.assigned && <Badge tone="blue">Assigned</Badge>}
                  </p>
                  <p className="text-xs text-gray-500">{c.matchReason}</p>
                </div>
                {c.assigned ? (
                  <Button variant="danger" onClick={() => { setAssignError(''); setRemoving(c); }}>
                    Reassign
                  </Button>
                ) : (
                  <Button
                    variant={c.suitable ? 'primary' : 'secondary'}
                    onClick={() => {
                      setAssignError('');
                      setMsg('');
                      setConfirming(c);
                    }}
                  >
                    Assign
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <ConfirmDialog
        open={Boolean(confirming)}
        title={confirming ? `Assign ${confirming.fullName}?` : ''}
        message={
          confirming &&
          (confirming.suitable
            ? `${confirming.matchReason}. They'll be able to log utility readings and cash payments for this property.`
            : `${confirming.matchReason}. You can still assign them; they'll be able to log utility readings and cash payments for this property.`)
        }
        confirmLabel="Assign caretaker"
        loading={assigning}
        error={assignError}
        onConfirm={assign}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={Boolean(removing)}
        tone="danger"
        title={removing ? `Remove ${removing.fullName} from this property?` : ''}
        message="They will no longer be able to log readings or record cash payments for this property. You can assign a replacement afterwards."
        confirmLabel="Remove caretaker"
        loading={assigning}
        error={assignError}
        onConfirm={unassign}
        onCancel={() => setRemoving(null)}
      />
    </Card>
  );
}

export default function PropertyManagePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [roomToDelete, setRoomToDelete] = useState(null);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [deleteRoomError, setDeleteRoomError] = useState('');

  const load = () => {
    setLoading(true);
    PropertyApi.getForManagement(id)
      .then((data) => {
        setProperty(data.property);
        setRooms(data.rooms);
      })
      .catch(() => setError('Could not load this property.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  // Runs only from the dialog's confirm button.
  const onDelete = async () => {
    setDeleteError('');
    setDeleting(true);
    try {
      await PropertyApi.remove(id);
      navigate('/landlord/properties');
    } catch (err) {
      // e.g. PROPERTY_HAS_TENANTS / PROPERTY_HAS_PENDING_REQUESTS: the backend says what to resolve first.
      setDeleteError(err.message || 'Could not delete property.');
      setDeleting(false);
    }
  };

  const setRoomStatus = async (roomId, status) => {
    try {
      const { room } = await PropertyApi.updateRoom(roomId, { status });
      setRooms((prev) => prev.map((r) => (r._id === roomId ? room : r)));
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteRoom = async () => {
    if (!roomToDelete) return;
    setDeletingRoom(true);
    setDeleteRoomError('');
    try {
      await PropertyApi.removeRoom(roomToDelete._id);
      setRooms((prev) => prev.filter((room) => room._id !== roomToDelete._id));
      setRoomToDelete(null);
    } catch (err) {
      setDeleteRoomError(describeApiError(err).message || 'Could not delete room.');
    } finally {
      setDeletingRoom(false);
    }
  };

  if (loading)
    return (
      <DashboardLayout>
        <LoadingState />
      </DashboardLayout>
    );
  if (error && !property)
    return (
      <DashboardLayout>
        <ErrorBanner message={error} />
      </DashboardLayout>
    );
  if (!property) return null;

  return (
    <DashboardLayout>
      <Link to="/landlord/properties" className="mb-3 inline-flex items-center gap-1 rounded text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" /> All properties
      </Link>
      <PageHeader
        title={property.propertyName}
        description={`${property.address.street}, ${property.address.barangay}, ${property.address.city}`}
        actions={
          <Button
            variant="danger"
            onClick={() => {
              setDeleteError('');
              setDeleteOpen(true);
            }}
          >
            Delete property
          </Button>
        }
      >
        <div className="mt-2">
          <StatusBadge status={property.listingStatus} tones={STATUS_TONE} />
        </div>
      </PageHeader>

      <div className="mb-4 space-y-3 empty:hidden">
        <ErrorBanner message={error} />
        <SuccessBanner message={msg} />
      </div>

      <Card title="Rooms & pricing" className="mb-6">
        <div className="mb-4 space-y-2">
          {rooms.map((room) => (
            <div key={room._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm">
              <div>
                <p className="font-semibold text-gray-900">Room {room.roomNumber}</p>
                <p className="mt-1 text-sm text-gray-500">
                  <span className="font-semibold tabular-nums text-gray-800">{formatPeso(room.monthlyBaseRent)}</span> / slot / month
                  <span className="mx-2 text-gray-300">·</span>{room.currentOccupancy} of {room.capacity} occupied
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={room.status} tones={STATUS_TONE} />
                {room.status === 'maintenance' ? (
                  <Button variant="secondary" disabled={room.currentOccupancy >= room.capacity} title={room.currentOccupancy >= room.capacity ? 'A full room cannot be marked available' : 'Return this room to the available list'} onClick={() => setRoomStatus(room._id, 'available')}>
                    Mark available
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setRoomStatus(room._id, 'maintenance')}>
                    Mark maintenance
                  </Button>
                )}
                <Button variant="danger" onClick={() => { setDeleteRoomError(''); setRoomToDelete(room); }}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          {rooms.length === 0 && <p className="text-sm text-gray-500">No rooms yet — add one below.</p>}
        </div>
        <AddRoomForm
          propertyId={id}
          onAdded={(room) => {
            setRooms((prev) => [...prev, room]);
            setMsg('Room added.');
          }}
        />
      </Card>

      <ConfirmDialog
        open={Boolean(roomToDelete)}
        tone="danger"
        title={roomToDelete ? `Delete Room ${roomToDelete.roomNumber}?` : ''}
        message="Are you sure you want to continue? A room with reservation records or current occupants cannot be deleted, so its history stays intact."
        confirmLabel="Delete room"
        loading={deletingRoom}
        error={deleteRoomError}
        onConfirm={deleteRoom}
        onCancel={() => setRoomToDelete(null)}
      />

      <CaretakerAssignment propertyId={id} />

      <ConfirmDialog
        open={deleteOpen}
        tone="danger"
        title="Delete this property?"
        message="It will be removed from search and your listings. Its rooms, reservation history, bills, payment records and reviews are kept on record, not erased. You must first complete or cancel current tenancies and answer pending requests."
        confirmLabel="Delete property"
        loading={deleting}
        error={deleteError}
        onConfirm={onDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </DashboardLayout>
  );
}
