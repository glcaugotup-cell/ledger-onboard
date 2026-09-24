import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { Badge, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';

const STATUS_TONE = { draft: 'gray', pending_moderation: 'yellow', approved: 'green', rejected: 'red', inactive: 'gray', available: 'green', occupied: 'red', maintenance: 'yellow' };

function AddRoomForm({ propertyId, onAdded }) {
  const [form, setForm] = useState({ roomNumber: '', capacity: '2', monthlyBaseRent: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { room } = await PropertyApi.createRoom(propertyId, { ...form, capacity: Number(form.capacity), monthlyBaseRent: Number(form.monthlyBaseRent) });
      onAdded(room);
      setForm({ roomNumber: '', capacity: '2', monthlyBaseRent: '' });
    } catch (err) {
      setError(err.message || 'Could not add room.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
      <ErrorBanner message={error} />
      <Field label="Room #">
        <TextInput value={form.roomNumber} onChange={(e) => setForm({ ...form, roomNumber: e.target.value })} required />
      </Field>
      <Field label="Capacity">
        <TextInput type="number" min="1" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} required />
      </Field>
      <Field label="Rent / slot (₱)">
        <TextInput type="number" min="0" value={form.monthlyBaseRent} onChange={(e) => setForm({ ...form, monthlyBaseRent: e.target.value })} required />
      </Field>
      <Button type="submit" loading={loading}>
        Add room
      </Button>
    </form>
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

  const onDelete = async () => {
    if (!confirm('Delete this property permanently? This cannot be undone.')) return;
    try {
      await PropertyApi.remove(id);
      navigate('/landlord/properties');
    } catch (err) {
      setError(err.message || 'Could not delete property.');
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

  if (loading) return (
    <DashboardLayout>
      <LoadingState />
    </DashboardLayout>
  );
  if (error && !property) return (
    <DashboardLayout>
      <ErrorBanner message={error} />
    </DashboardLayout>
  );
  if (!property) return null;

  return (
    <DashboardLayout>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900">{property.propertyName}</h1>
            <Badge tone={STATUS_TONE[property.listingStatus]}>{property.listingStatus.replace('_', ' ')}</Badge>
          </div>
          <p className="text-sm text-gray-500">{property.address.street}, {property.address.barangay}, {property.address.city}</p>
        </div>
        <Button variant="danger" onClick={onDelete}>
          Delete property
        </Button>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={msg} />

      <Card title="Rooms" className="mb-6">
        <div className="mb-4 space-y-2">
          {rooms.map((room) => (
            <div key={room._id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
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
        <AddRoomForm propertyId={id} onAdded={(room) => { setRooms((prev) => [...prev, room]); setMsg('Room added.'); }} />
      </Card>
    </DashboardLayout>
  );
}
