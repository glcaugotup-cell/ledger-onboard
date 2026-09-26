import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import UtilityApi from '../../services/UtilityApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';

const today = new Date();
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

const isNonNegativeNumber = (v) => v !== '' && v !== undefined && Number.isFinite(Number(v)) && Number(v) >= 0;

/** Same rules as the backend: amounts and readings are 0 or more, and usage can't be negative. */
function validateReading({ roomId, readingMonth, totalElectricBill, totalWaterBill, tenants, readings }) {
  const errors = {};
  if (!roomId) errors.roomId = 'Select a room.';
  if (!readingMonth) errors.readingMonth = 'Choose the billing month.';
  if (!isNonNegativeNumber(totalElectricBill)) errors.totalElectricBill = 'Enter the electric bill (0 or more).';
  if (!isNonNegativeNumber(totalWaterBill)) errors.totalWaterBill = 'Enter the water bill (0 or more).';
  for (const t of tenants) {
    const r = readings[t._id] || {};
    if (!isNonNegativeNumber(r.previousReading) || !isNonNegativeNumber(r.currentReading)) {
      errors[t._id] = 'Enter both readings (0 or more).';
    } else if (Number(r.currentReading) < Number(r.previousReading)) {
      errors[t._id] = 'Current reading cannot be less than the previous reading.';
    }
  }
  return errors;
}

export default function UtilityEntryPage() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roomId, setRoomId] = useState('');
  const [readingMonth, setReadingMonth] = useState(defaultMonth);
  const [totalElectricBill, setTotalElectricBill] = useState('');
  const [totalWaterBill, setTotalWaterBill] = useState('');
  const [readings, setReadings] = useState({}); // tenantId -> { previousReading, currentReading }
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    ReservationApi.list()
      .then(({ reservations: list }) => setReservations(list.filter((r) => r.status === 'approved')))
      .catch(() => setError('Could not load your assigned rooms.'))
      .finally(() => setLoading(false));
  }, []);

  const rooms = useMemo(() => {
    const byRoom = new Map();
    for (const r of reservations) {
      const key = r.roomId?._id;
      if (!key) continue;
      if (!byRoom.has(key)) byRoom.set(key, { room: r.roomId, tenants: [] });
      byRoom.get(key).tenants.push(r.tenantId);
    }
    return [...byRoom.values()];
  }, [reservations]);

  const selected = rooms.find((r) => r.room._id === roomId);

  const updateReading = (tenantId, field, value) => {
    setReadings((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], [field]: value } }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    const errors = validateReading({ roomId, readingMonth, totalElectricBill, totalWaterBill, tenants: selected?.tenants || [], readings });
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSubmitting(true);
    try {
      const occupantReadings = selected.tenants.map((t) => ({
        tenantId: t._id,
        previousReading: Number(readings[t._id]?.previousReading || 0),
        currentReading: Number(readings[t._id]?.currentReading || 0),
      }));
      const result = await UtilityApi.logReading({
        roomId,
        readingMonth,
        totalElectricBill: Number(totalElectricBill),
        totalWaterBill: Number(totalWaterBill),
        occupantReadings,
      });
      setSuccess(result);
      setReadings({});
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <LoadingState />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Log utility reading</h1>
      <Card className="max-w-2xl">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <ErrorBanner message={error} />
          {success && (
            <SuccessBanner
              message={`Reading logged. Generated ${success.soas.length} statement(s) totaling ₱${success.soas.reduce((s, x) => s + x.totalAmountDue, 0).toLocaleString()}.`}
            />
          )}
          <Field label="Room" error={fieldErrors.roomId}>
            <Select value={roomId} onChange={(e) => setRoomId(e.target.value)} error={fieldErrors.roomId}>
              <option value="">Select a room…</option>
              {rooms.map(({ room }) => (
                <option key={room._id} value={room._id}>
                  Room {room.roomNumber}
                </option>
              ))}
            </Select>
          </Field>

          {selected && (
            <>
              <Field label="Billing month" error={fieldErrors.readingMonth}>
                <TextInput type="date" value={readingMonth} onChange={(e) => setReadingMonth(e.target.value)} error={fieldErrors.readingMonth} />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Total electric bill (₱)" error={fieldErrors.totalElectricBill}>
                  <TextInput
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalElectricBill}
                    onChange={(e) => setTotalElectricBill(e.target.value)}
                    error={fieldErrors.totalElectricBill}
                  />
                </Field>
                <Field label="Total water bill (₱)" error={fieldErrors.totalWaterBill}>
                  <TextInput type="number" min="0" step="0.01" value={totalWaterBill} onChange={(e) => setTotalWaterBill(e.target.value)} error={fieldErrors.totalWaterBill} />
                </Field>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Per-tenant electricity readings</p>
                <div className="space-y-2">
                  {selected.tenants.map((t) => (
                    <div key={t._id} className={`grid grid-cols-3 items-center gap-2 rounded-lg border p-2 ${fieldErrors[t._id] ? 'border-red-300' : 'border-gray-200'}`}>
                      <p className="text-sm text-gray-700">{t.fullName}</p>
                      <TextInput
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Previous reading"
                        value={readings[t._id]?.previousReading || ''}
                        onChange={(e) => updateReading(t._id, 'previousReading', e.target.value)}
                      />
                      <TextInput
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Current reading"
                        value={readings[t._id]?.currentReading || ''}
                        onChange={(e) => updateReading(t._id, 'currentReading', e.target.value)}
                      />
                      {fieldErrors[t._id] && <p className="col-span-3 text-xs text-red-600">{fieldErrors[t._id]}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <Button type="submit" loading={submitting} className="w-full">
                Submit reading &amp; generate statements
              </Button>
            </>
          )}
        </form>
      </Card>
    </DashboardLayout>
  );
}
