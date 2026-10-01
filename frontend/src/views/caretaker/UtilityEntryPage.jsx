import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import UtilityApi from '../../services/UtilityApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { formatDateTime, formatPeriod, formatPeso } from '../../utils/format.js';

const today = new Date();
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
const MAX_BILL_AMOUNT = 1_000_000;
const MAX_METER_READING = 10_000_000;

const isBoundedDecimal = (value, max) => value !== '' && value !== undefined && /^\d+(\.\d{1,2})?$/.test(String(value)) && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= max;

/** Same rules as the backend: bounded bills/readings, current billing month or earlier, and nonnegative usage. */
function validateReading({ roomId, readingMonth, totalElectricBill, totalWaterBill, tenants, readings }) {
  const errors = {};
  if (!roomId) errors.roomId = 'Select a room.';
  if (!readingMonth) errors.readingMonth = 'Choose the billing month.';
  else if (readingMonth.slice(0, 7) > defaultMonth.slice(0, 7)) errors.readingMonth = 'Billing month cannot be in the future.';
  if (!isBoundedDecimal(totalElectricBill, MAX_BILL_AMOUNT)) errors.totalElectricBill = 'Enter an electric bill from ₱0 to ₱1,000,000 (up to 2 decimal places).';
  if (!isBoundedDecimal(totalWaterBill, MAX_BILL_AMOUNT)) errors.totalWaterBill = 'Enter a water bill from ₱0 to ₱1,000,000 (up to 2 decimal places).';
  for (const t of tenants) {
    const r = readings[t._id] || {};
    if (!isBoundedDecimal(r.previousReading, MAX_METER_READING) || !isBoundedDecimal(r.currentReading, MAX_METER_READING)) {
      errors[t._id] = 'Enter both readings from 0 to 10,000,000 (up to 2 decimal places).';
    } else if (Number(r.currentReading) < Number(r.previousReading)) {
      errors[t._id] = 'Current reading cannot be less than the previous reading.';
    }
  }
  return errors;
}

function validateFixedRate({ roomId, readingMonth }) {
  const errors = {};
  if (!roomId) errors.roomId = 'Select a room.';
  if (!readingMonth) errors.readingMonth = 'Choose the billing month.';
  else if (readingMonth.slice(0, 7) > defaultMonth.slice(0, 7)) errors.readingMonth = 'Billing month cannot be in the future.';
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
  const [readingLog, setReadingLog] = useState([]);

  useEffect(() => {
    Promise.all([ReservationApi.list(), UtilityApi.listMine()])
      .then(([{ reservations: list }, { readings: logs }]) => {
        setReservations(list.filter((r) => r.status === 'approved'));
        setReadingLog(logs);
      })
      .catch(() => setError('Could not load your assigned rooms or utility log.'))
      .finally(() => setLoading(false));
  }, []);

  const rooms = useMemo(() => {
    const byRoom = new Map();
    for (const r of reservations) {
      const key = r.roomId?._id;
      if (!key) continue;
      if (!byRoom.has(key)) byRoom.set(key, { room: r.roomId, property: r.propertyId, tenants: [] });
      byRoom.get(key).tenants.push(r.tenantId);
    }
    return [...byRoom.values()];
  }, [reservations]);

  const selected = rooms.find((r) => r.room._id === roomId);
  const propertyType = selected?.property?.propertyType || selected?.room?.propertyType;
  const fixedRate = ['Room Only', 'Bedspace'].includes(propertyType);

  const updateReading = (tenantId, field, value) => {
    setReadings((prev) => ({ ...prev, [tenantId]: { ...prev[tenantId], [field]: value } }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    const errors = fixedRate
      ? validateFixedRate({ roomId, readingMonth })
      : validateReading({ roomId, readingMonth, totalElectricBill, totalWaterBill, tenants: selected?.tenants || [], readings });
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSubmitting(true);
    try {
      const result = fixedRate
        ? await UtilityApi.logFixedRate({ roomId, readingMonth })
        : await UtilityApi.logReading({
            roomId,
            readingMonth,
            totalElectricBill: Number(totalElectricBill),
            totalWaterBill: Number(totalWaterBill),
            occupantReadings: selected.tenants.map((t) => ({
              tenantId: t._id,
              previousReading: Number(readings[t._id]?.previousReading || 0),
              currentReading: Number(readings[t._id]?.currentReading || 0),
            })),
          });
      setSuccess(result);
      setReadings({});
      const { readings: logs } = await UtilityApi.listMine();
      setReadingLog(logs);
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
      <PageHeader title="Log utilities or fixed rent" description="Apartments and studios use electricity and water readings. Room Only and Bedspace use the room’s fixed monthly rate." />
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
              {rooms.map(({ room, property }) => (
                <option key={room._id} value={room._id}>
                  Room {room.roomNumber} · {property?.propertyType || 'Property'}
                </option>
              ))}
            </Select>
          </Field>

          {selected && (
            <>
              <Field label="Billing month" error={fieldErrors.readingMonth}>
                <TextInput type="date" max={defaultMonth} value={readingMonth} onChange={(e) => setReadingMonth(e.target.value)} error={fieldErrors.readingMonth} />
              </Field>
              {fixedRate ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                  Fixed-rate billing · {propertyType}. The tenant will be billed {formatPeso(selected.room.monthlyBaseRent)} per month, with no electricity or water meter readings.
                </div>
              ) : (
              <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Total electric bill (₱)" error={fieldErrors.totalElectricBill}>
                  <TextInput
                    type="number"
                    min="0"
                    max={MAX_BILL_AMOUNT}
                    step="0.01"
                    inputMode="decimal"
                    value={totalElectricBill}
                    onChange={(e) => setTotalElectricBill(e.target.value)}
                    error={fieldErrors.totalElectricBill}
                  />
                </Field>
                <Field label="Total water bill (₱)" error={fieldErrors.totalWaterBill}>
                  <TextInput type="number" min="0" max={MAX_BILL_AMOUNT} step="0.01" inputMode="decimal" value={totalWaterBill} onChange={(e) => setTotalWaterBill(e.target.value)} error={fieldErrors.totalWaterBill} />
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
                        max={MAX_METER_READING}
                        step="0.01"
                        inputMode="decimal"
                        placeholder="Previous reading"
                        value={readings[t._id]?.previousReading || ''}
                        onChange={(e) => updateReading(t._id, 'previousReading', e.target.value)}
                      />
                      <TextInput
                        type="number"
                        min="0"
                        max={MAX_METER_READING}
                        step="0.01"
                        inputMode="decimal"
                        placeholder="Current reading"
                        value={readings[t._id]?.currentReading || ''}
                        onChange={(e) => updateReading(t._id, 'currentReading', e.target.value)}
                      />
                      {fieldErrors[t._id] && <p className="col-span-3 text-xs text-red-600">{fieldErrors[t._id]}</p>}
                    </div>
                  ))}
                </div>
              </div>
              </>
              )}

              <Button type="submit" loading={submitting} className="w-full">
                {fixedRate ? 'Generate fixed-rate statements' : 'Submit readings & generate statements'}
              </Button>
            </>
          )}
        </form>
      </Card>
      <Card title="Utility entry log" description="Recent room bills and meter readings you have submitted." className="mt-6 max-w-5xl">
        {readingLog.length === 0 ? <p className="py-4 text-sm text-gray-500">No utility readings logged yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-4">Billing month</th><th className="py-2 pr-4">Room</th><th className="py-2 pr-4">Electric bill</th><th className="py-2 pr-4">Water bill</th><th className="py-2 pr-4">Meter use</th><th className="py-2">Logged</th></tr></thead><tbody className="divide-y divide-gray-100">{readingLog.map((entry) => <tr key={entry._id}><td className="py-3 pr-4 font-medium">{formatPeriod(entry.readingMonth)}</td><td className="py-3 pr-4">Room {reservations.find((r) => String(r.roomId?._id) === String(entry.roomId))?.roomId?.roomNumber || '—'}</td><td className="py-3 pr-4 tabular-nums">{formatPeso(entry.totalElectricBill)}</td><td className="py-3 pr-4 tabular-nums">{formatPeso(entry.totalWaterBill)}</td><td className="py-3 pr-4 tabular-nums">{(entry.currElectricityKWh - entry.prevElectricityKWh).toLocaleString()} kWh</td><td className="py-3 text-gray-500">{formatDateTime(entry.createdAt)}</td></tr>)}</tbody></table></div>}
      </Card>
    </DashboardLayout>
  );
}
