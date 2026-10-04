import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDaysIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import ReservationApi from '../services/ReservationApi.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import ReasonDialog from './ReasonDialog.jsx';
import { Field, Select } from './ui/Field.jsx';
import { Badge, EmptyState, ErrorBanner, SuccessBanner } from './ui/Feedback.jsx';
import { formatDate, formatPeso, initials } from '../utils/format.js';
import { describeApiError } from '../utils/errors.js';
import { RESERVATION_TONE, reservationLabel } from '../utils/reservationStatus.js';

const DECLINE_LEAVE_REASONS = ['Outstanding balance must be settled first', 'Notice period has not been met', 'Contract period has not ended'];

function SectionTitle({ id, count, children }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 id={id} className="text-base font-semibold text-gray-900">{children}</h3>
      <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-gray-700">{count}</span>
    </div>
  );
}

/** Caretakers who work in the property's barangay are listed first, under their own heading. */
export function CaretakerOptions({ caretakers, barangay }) {
  const suitable = caretakers.filter((c) => barangay && c.serviceBarangay === barangay);
  const others = caretakers.filter((c) => !suitable.includes(c));
  const label = (c) => (c.serviceBarangay ? `${c.fullName} (works in ${c.serviceBarangay})` : c.fullName);
  if (suitable.length === 0) return others.map((c) => <option key={c._id} value={c._id}>{label(c)}</option>);
  return (
    <>
      <optgroup label={`Suitable — works in ${barangay}`}>
        {suitable.map((c) => <option key={c._id} value={c._id}>{c.fullName}</option>)}
      </optgroup>
      {others.length > 0 && (
        <optgroup label="Other caretakers">
          {others.map((c) => <option key={c._id} value={c._id}>{label(c)}</option>)}
        </optgroup>
      )}
    </>
  );
}

const dayLabel = (key) => formatDate(`${key}T00:00:00`);

/**
 * The landlord's view of a tenancy's life: (1) reservation requests, (2) awaiting move-in,
 * (3) current tenants (with requests to leave), and optionally (4) history. Used by the
 * Reservations overview and by each property's "Tenants & reservations" section.
 */
export default function TenancyManager({ reservations, caretakers = [], onChanged, showHistory = false, highlightId = null, landlordHasQr = true, headingLevelOffset = '' }) {
  const [assignments, setAssignments] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dialog, setDialog] = useState(null); // { kind, reservation }
  const [dialogError, setDialogError] = useState('');

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`tenancy-${highlightId}`)?.scrollIntoView?.({ block: 'center' });
  }, [highlightId, reservations]);

  const run = async (id, action, successText) => {
    setBusyId(id);
    setError('');
    setDialogError('');
    try {
      await action();
      setDialog(null);
      setMessage(successText);
      await onChanged?.();
    } catch (err) {
      const text = describeApiError(err).message || 'Could not update this reservation.';
      if (dialog) setDialogError(text);
      else setError(text);
    } finally {
      setBusyId(null);
    }
  };

  const currentCaretaker = (r) => String(r.caretakerAssignedId?._id || r.caretakerAssignedId || '');
  // The picker shows the landlord's unsaved choice, or the tenancy's current caretaker.
  const assignmentFor = (r) => assignments[r._id] ?? currentCaretaker(r);
  const setStatus = (r, payload, successText) => run(r._id, () => ReservationApi.updateStatus(r._id, payload), successText);
  const open = (kind, reservation) => { setDialogError(''); setDialog({ kind, reservation }); };

  const pending = reservations.filter((r) => r.status === 'pending');
  const reserved = reservations.filter((r) => r.status === 'approved');
  const current = reservations.filter((r) => r.status === 'active');
  const past = reservations.filter((r) => !['pending', 'approved', 'active'].includes(r.status));

  const who = (r) => (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 ring-1 ring-brand-100">{initials(r.tenantId?.fullName || 'Tenant')}</span>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">{r.tenantId?.fullName || 'Tenant'}</p>
        <p className="mt-0.5 text-sm text-gray-600">{r.propertyId?.propertyName ? `${r.propertyId.propertyName} · ` : ''}Room {r.roomId?.roomNumber}</p>
        <p className="mt-1 text-xs text-gray-500">
          {r.status === 'active' ? `Moved in ${formatDate(r.movedInAt || r.moveInDate)}` : `Move-in ${formatDate(r.moveInDate)}`}
          {r.status === 'approved' && r.holdUntil ? ` · Held until ${dayLabel(r.holdUntil)}` : ''}
          {r.status === 'rejected' && r.rejectionReason ? ` · Reason: ${r.rejectionReason}` : ''}
          {r.status === 'cancelled' && r.cancellationReason ? ` · ${r.cancellationReason}` : ''}
        </p>
        {(r.tenantId?.phone || r.tenantId?.email) && (
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {r.tenantId?.phone && <a className="text-brand-700 hover:underline" href={`tel:${r.tenantId.phone}`}>{r.tenantId.phone}</a>}
            {r.tenantId?.phone && r.tenantId?.email ? ' · ' : ''}
            {r.tenantId?.email && <a className="text-brand-700 hover:underline" href={`mailto:${r.tenantId.email}`}>{r.tenantId.email}</a>}
          </p>
        )}
      </div>
    </div>
  );

  const caretakerPicker = (r, label) => (
    <Field label={label}>
      <Select aria-label={`${label} for ${r.tenantId?.fullName || 'this tenant'}`} value={assignmentFor(r)} onChange={(e) => setAssignments({ ...assignments, [r._id]: e.target.value })} className="sm:w-56">
        <option value="" disabled hidden>Select caretaker</option>
        <CaretakerOptions caretakers={caretakers} barangay={r.propertyId?.address?.barangay} />
      </Select>
    </Field>
  );

  const cardClass = (r, accent) => `${accent} transition-shadow hover:shadow-md ${highlightId === r._id ? 'ring-2 ring-amber-300' : ''}`;
  const d = dialog?.reservation;
  const balance = d?.outstandingBalance || 0;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <ErrorBanner message={error} />
        <SuccessBanner message={message} />
      </div>
      {!landlordHasQr && (reserved.length > 0) && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Upload your GCash QR code in <Link to="/landlord/profile" className="font-semibold underline">Account</Link> before confirming a move-in, so tenants can pay their bills.</span>
        </p>
      )}

      <section aria-labelledby={`requests-heading${headingLevelOffset}`}>
        <SectionTitle id={`requests-heading${headingLevelOffset}`} count={pending.length}>Reservation requests</SectionTitle>
        {pending.length === 0 && <EmptyState icon={CalendarDaysIcon} title="No pending requests" description="New reservation requests from tenants appear here." />}
        <div className="space-y-3">
          {pending.map((r) => (
            <Card key={r._id} id={`tenancy-${r._id}`} className={cardClass(r, 'border-l-4 border-l-amber-400')}>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                {who(r)}
                <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:items-center xl:border-0 xl:pt-0">
                  {caretakerPicker(r, 'Assign caretaker')}
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button loading={busyId === r._id} onClick={() => setStatus(r, { status: 'approved', ...(assignmentFor(r) ? { caretakerAssignedId: assignmentFor(r) } : {}) }, `${r.tenantId?.fullName || 'The tenant'}'s reservation is approved. The room is held until move-in.`)}>
                      Approve
                    </Button>
                    <Button variant="danger" loading={busyId === r._id} onClick={() => setStatus(r, { status: 'rejected', rejectionReason: 'Not a fit for this room' }, 'Request rejected. The tenant has been notified.')}>Reject</Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby={`awaiting-heading${headingLevelOffset}`}>
        <SectionTitle id={`awaiting-heading${headingLevelOffset}`} count={reserved.length}>Awaiting move-in</SectionTitle>
        {reserved.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500">Approved tenants who haven’t moved in yet appear here.</p>}
        <div className="space-y-2">
          {reserved.map((r) => {
            const noShowOpen = r.holdUntil && r.today ? r.today > r.holdUntil : true;
            return (
              <Card key={r._id} id={`tenancy-${r._id}`} className={cardClass(r, 'border-l-4 border-l-sky-400')}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {who(r)}
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <Badge tone={RESERVATION_TONE.approved}>{reservationLabel('approved')}</Badge>
                    <Button loading={busyId === r._id} onClick={() => open('moveIn', r)}>Confirm move-in</Button>
                    <Button variant="secondary" disabled={!noShowOpen || busyId === r._id} title={noShowOpen ? undefined : `Available after ${dayLabel(r.holdUntil)}`} onClick={() => open('noShow', r)}>
                      Mark no-show
                    </Button>
                  </div>
                </div>
                {!noShowOpen && <p className="mt-2 text-xs text-gray-500">You can mark a no-show after {dayLabel(r.holdUntil)} if the tenant hasn’t arrived.</p>}
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby={`current-heading${headingLevelOffset}`}>
        <SectionTitle id={`current-heading${headingLevelOffset}`} count={current.length}>Current tenants</SectionTitle>
        {current.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500">No one has moved in yet. Confirm a move-in to start billing.</p>}
        <div className="space-y-2">
          {current.map((r) => {
            const leave = r.leaveRequest?.status === 'pending' ? r.leaveRequest : null;
            return (
              <Card key={r._id} id={`tenancy-${r._id}`} className={cardClass(r, leave ? 'border-l-4 border-l-red-400' : '')}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  {who(r)}
                  <div className="flex flex-wrap items-end gap-2 lg:justify-end">
                    {caretakerPicker(r, 'Caretaker')}
                    <Button variant="secondary" loading={busyId === r._id} disabled={!assignmentFor(r) || assignmentFor(r) === currentCaretaker(r)} onClick={() => run(r._id, () => ReservationApi.reassignCaretaker(r._id, assignmentFor(r)), 'Caretaker updated.')}>
                      Reassign
                    </Button>
                    <Button variant="secondary" disabled={busyId === r._id} onClick={() => open('moveOut', r)}>Mark moved out</Button>
                  </div>
                </div>
                {typeof r.outstandingBalance === 'number' && (
                  <p className={`mt-3 text-sm ${r.outstandingBalance > 0 ? 'font-semibold text-red-700' : 'text-gray-500'}`}>
                    Outstanding balance: {formatPeso(r.outstandingBalance)}
                  </p>
                )}
                {leave && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="text-sm font-semibold text-red-900">Request to leave · {formatDate(leave.requestedAt)}</p>
                    {leave.note && <p className="mt-0.5 text-sm text-red-900">“{leave.note}”</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button loading={busyId === r._id} onClick={() => open('leaveApprove', r)}>Approve request</Button>
                      <Button variant="secondary" disabled={busyId === r._id} onClick={() => open('leaveDecline', r)}>Decline</Button>
                    </div>
                  </div>
                )}
                {r.leaveRequest?.status === 'approved' && <p className="mt-2 text-xs font-medium text-gray-600">Request to leave approved. Mark the tenant moved out once they have left.</p>}
              </Card>
            );
          })}
        </div>
      </section>

      {showHistory && (
        <section aria-labelledby={`history-heading${headingLevelOffset}`}>
          <SectionTitle id={`history-heading${headingLevelOffset}`} count={past.length}>History</SectionTitle>
          {past.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-5 text-sm text-gray-500">Completed, rejected, cancelled and no-show reservations appear here.</p>}
          <div className="space-y-2">
            {past.map((r) => (
              <Card key={r._id} id={`tenancy-${r._id}`} className={cardClass(r, '')}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  {who(r)}
                  <Badge tone={RESERVATION_TONE[r.status] || 'gray'}>{reservationLabel(r.status)}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <ReasonDialog
        open={dialog?.kind === 'leaveDecline'}
        title="Decline the request to leave?"
        message="The tenant will see the reason you choose."
        reasons={DECLINE_LEAVE_REASONS}
        confirmLabel="Decline request"
        loading={busyId === d?._id}
        error={dialogError}
        onConfirm={(reason) => run(d._id, () => ReservationApi.decideLeave(d._id, { decision: 'decline', reason }), 'Request to leave declined. The tenant has been notified.')}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'moveIn'}
        title="Confirm move-in?"
        message={`Confirm that ${d?.tenantId?.fullName || 'the tenant'} has moved in to Room ${d?.roomId?.roomNumber || ''}. Their bills and maintenance requests start now, and their other pending requests are cancelled automatically.`}
        confirmLabel="Confirm move-in"
        loading={busyId === d?._id}
        error={dialogError}
        onConfirm={() => setStatus(d, { status: 'active' }, 'Move-in confirmed. The tenant now has a current stay.')}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'noShow'}
        tone="danger"
        title="Mark as no-show?"
        message="The tenant didn’t arrive within the hold period. The room will be released so it can be rented again."
        confirmLabel="Mark no-show"
        loading={busyId === d?._id}
        error={dialogError}
        onConfirm={() => setStatus(d, { status: 'no_show' }, 'Marked as no-show. The room was released.')}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'moveOut'}
        tone="danger"
        title="Mark moved out?"
        message={`This ends ${d?.tenantId?.fullName || 'the tenant'}’s stay and frees the slot. ${balance > 0 ? `They still owe ${formatPeso(balance)}; the balance stays on record and is not erased.` : 'They have no outstanding balance.'}`}
        confirmLabel="Mark moved out"
        loading={busyId === d?._id}
        error={dialogError}
        onConfirm={() => setStatus(d, { status: 'completed' }, 'Marked as moved out. The tenant can now rate their stay.')}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.kind === 'leaveApprove'}
        tone={balance > 0 ? 'danger' : 'primary'}
        title="Approve the request to leave?"
        message={balance > 0
          ? `This tenant still owes ${formatPeso(balance)}. Approving does not erase it: the balance stays on record. Confirm that you want to approve anyway.`
          : 'The tenant has no outstanding balance. After they leave, mark them moved out.'}
        confirmLabel={balance > 0 ? `Approve with ${formatPeso(balance)} owed` : 'Approve request'}
        loading={busyId === d?._id}
        error={dialogError}
        onConfirm={() => run(d._id, () => ReservationApi.decideLeave(d._id, { decision: 'approve', acknowledgeBalance: balance > 0 }), 'Request to leave approved. Mark the tenant moved out once they have left.')}
        onCancel={() => setDialog(null)}
      />
    </div>
  );
}
