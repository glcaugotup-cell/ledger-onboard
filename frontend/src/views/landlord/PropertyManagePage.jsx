import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { Badge, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst } from '../../utils/textFormat.js';

const STATUS_TONE = { draft: 'gray', pending_moderation: 'yellow', approved: 'green', rejected: 'red', inactive: 'gray', available: 'green', occupied: 'red', maintenance: 'yellow' };

/** Same limits as backend/validators/roomValidators.js. */
function validateRoom({ roomNumber, capacity, monthlyBaseRent }) {
  const errors = {};
  if (!roomNumber.trim()) errors.roomNumber = 'Room number is required';
  else if (roomNumber.trim().length > 20) errors.roomNumber = 'Room number must be at most 20 characters';
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 50) errors.capacity = 'Capacity must be a whole number from 1 to 50';
  const rent = Number(monthlyBaseRent);
  if (monthlyBaseRent === '' || Number.isNaN(rent) || rent < 0 || rent > 1000000) errors.monthlyBaseRent = 'Rent must be a number from 0 to 1,000,000';
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
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-start">
      <div className="sm:col-span-4">
        <ErrorBanner message={error} />
      </div>
      <Field label="Room #" error={fieldErrors.roomNumber}>
        <TextInput value={form.roomNumber} maxLength={20} onChange={(e) => setField('roomNumber', capitalizeFirst(e.target.value))} error={fieldErrors.roomNumber} />
      </Field>
      <Field label="Capacity" error={fieldErrors.capacity}>
        <TextInput type="number" min="1" max="50" step="1" value={form.capacity} onChange={(e) => setField('capacity', e.target.value)} error={fieldErrors.capacity} />
      </Field>
      <Field label="Rent / slot (₱)" error={fieldErrors.monthlyBaseRent}>
        <TextInput
          type="number"
          min="0"
          step="0.01"
          value={form.monthlyBaseRent}
          onChange={(e) => setField('monthlyBaseRent', e.target.value)}
          error={fieldErrors.monthlyBaseRent}
        />
      </Field>
      <div className="sm:pt-6">
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

  return (
    <Card title="Caretakers" className="mb-6">
      <ErrorBanner message={error} />
      <SuccessBanner message={msg} />
      {!data && !error && <p className="text-sm text-gray-400">Loading caretakers…</p>}
      {data && (
        <>
          <p className="mb-3 text-sm text-gray-500">
            This property is in <span className="font-medium text-gray-700">{data.propertyBarangay}</span>. Caretakers who work in the same barangay are
            suggested first.
          </p>
          {data.caretakers.length === 0 && (
            <p className="text-sm text-gray-400">You have no active caretakers yet. Invite one from the Caretakers page.</p>
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
                {!c.assigned && (
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
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{property.propertyName}</h1>
            <Badge tone={STATUS_TONE[property.listingStatus]}>{property.listingStatus.replace('_', ' ')}</Badge>
          </div>
          <p className="text-sm text-gray-500">
            {property.address.street}, {property.address.barangay}, {property.address.city}
          </p>
        </div>
        <Button
          variant="danger"
          onClick={() => {
            setDeleteError('');
            setDeleteOpen(true);
          }}
        >
          Delete property
        </Button>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={msg} />

      <Card title="Rooms" className="mb-6">
        <div className="mb-4 space-y-2">
          {rooms.map((room) => (
            <div key={room._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 p-3">
              <div>
                <p className="font-medium text-gray-800">Room {room.roomNumber}</p>
                <p className="text-xs text-gray-400">
                  ₱{room.monthlyBaseRent.toLocaleString()}/slot · {room.currentOccupancy}/{room.capacity} occupied
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[room.status]}>{room.status}</Badge>
                {room.status !== 'maintenance' ? (
                  <Button variant="secondary" onClick={() => setRoomStatus(room._id, 'maintenance')}>
                    Mark maintenance
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setRoomStatus(room._id, 'available')}>
                    Mark available
                  </Button>
                )}
              </div>
            </div>
          ))}
          {rooms.length === 0 && <p className="text-sm text-gray-400">No rooms yet — add one below.</p>}
        </div>
        <AddRoomForm
          propertyId={id}
          onAdded={(room) => {
            setRooms((prev) => [...prev, room]);
            setMsg('Room added.');
          }}
        />
      </Card>

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
