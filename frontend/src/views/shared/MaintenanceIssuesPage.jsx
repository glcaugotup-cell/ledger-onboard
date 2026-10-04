import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import ReasonDialog from '../../components/ReasonDialog.jsx';
import PhotoPicker from '../../components/PhotoPicker.jsx';
import { Field, FieldRequirement, Select, TextArea, TextInput } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import CaretakerApi from '../../services/CaretakerApi.js';
import MaintenanceIssueApi from '../../services/MaintenanceIssueApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst } from '../../utils/textFormat.js';
import { todayInputValue } from '../../utils/validators.js';

const CATEGORIES = ['Plumbing', 'Electrical', 'Appliance', 'Structural', 'Pest control', 'Cleaning', 'Other'];
const REMOVE_REASONS = ['Duplicate report', 'The issue does not exist', 'Not a maintenance issue', 'Already fixed before the report'];
const statusNames = { pending: 'Pending', in_progress: 'In Progress', awaiting_confirmation: 'Awaiting tenant confirmation', resolved: 'Resolved' };
const statusStyles = { pending: 'bg-amber-100 text-amber-800', in_progress: 'bg-blue-100 text-blue-800', awaiting_confirmation: 'bg-purple-100 text-purple-800', resolved: 'bg-green-100 text-green-800' };
const urgencyStyles = { low: 'bg-gray-100 text-gray-700', medium: 'bg-amber-100 text-amber-800', high: 'bg-red-100 text-red-800' };
const HISTORY_LABEL = { reported: 'Reported', assigned: 'Caretaker assigned', marked_done: 'Marked done', confirmed: 'Confirmed solved by the tenant', reopened: 'Reopened by the tenant', removed: 'Removed by the landlord', restored: 'Restored by the landlord' };
const OPEN_FOR_WORK = ['pending', 'in_progress'];

function Pill({ className = '', children }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>; }

function Modal({ label, children, wide = false }) {
  return (
    <section className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label={label}>
      <Card className={`max-h-[90vh] w-full overflow-auto ${wide ? 'max-w-xl' : 'max-w-lg'}`}>{children}</Card>
    </section>
  );
}

/**
 * Maintenance issues for every role. Tenants report and confirm fixes; landlords triage,
 * assign, mark done and remove invalid reports; caretakers record completed work.
 * `embedded` renders it inside My Apartment (no page header).
 */
export function MaintenanceIssuesContent({ embedded = false, highlightIssueId = null }) {
  const { user } = useAuth();
  const role = user?.role;
  const [issues, setIssues] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [caretakers, setCaretakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mediaUrls, setMediaUrls] = useState([]);
  const [filters, setFilters] = useState({ urgency: '', category: '', room: '' });

  // Report form (tenant)
  const [formOpen, setFormOpen] = useState(false);
  const [report, setReport] = useState({ reservationId: '', category: '', urgency: 'medium', description: '' });
  const [reportErrors, setReportErrors] = useState({});
  const [photos, setPhotos] = useState([]);
  // Assignment (landlord)
  const [assigning, setAssigning] = useState(null);
  const [assignment, setAssignment] = useState({ caretakerId: '', internalNotes: '', landlordUpdate: '', targetDate: '' });
  const [assignErrors, setAssignErrors] = useState({});
  // Mark done (landlord) and resolve (caretaker)
  const [completing, setCompleting] = useState(null);
  const [workSummary, setWorkSummary] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [proof, setProof] = useState([]);
  // Confirm, archive and remove dialogs
  const [reopening, setReopening] = useState(null);
  const [reopenNote, setReopenNote] = useState('');
  const [archiving, setArchiving] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const openedFromLink = useRef(false);

  const load = async () => {
    try {
      const [issueResponse, relatedResponse] = await Promise.all([
        MaintenanceIssueApi.list(),
        role === 'tenant' ? ReservationApi.list() : role === 'landlord' ? CaretakerApi.list() : Promise.resolve(null),
      ]);
      setIssues(issueResponse.issues);
      // Reports are only for a current stay (after the landlord confirms the move-in).
      if (role === 'tenant') setReservations(relatedResponse.reservations.filter((item) => item.status === 'active'));
      if (role === 'landlord') setCaretakers(relatedResponse.caretakers.filter((item) => item.accountStatus === 'active'));
      setError('');
    } catch { setError('Could not load maintenance issues.'); }
    finally { setLoading(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [role]);

  // Notification links open the exact issue.
  useEffect(() => {
    if (!highlightIssueId || loading || openedFromLink.current) return;
    const issue = issues.find((item) => item._id === highlightIssueId);
    if (!issue) return;
    openedFromLink.current = true;
    document.getElementById(`issue-${issue._id}`)?.scrollIntoView?.({ block: 'center' });
    setSelected(issue);
  }, [highlightIssueId, loading, issues]);

  useEffect(() => {
    if (!selected) { setMediaUrls([]); return undefined; }
    setMediaUrls([]);
    let active = true;
    const loadMedia = async () => {
      const refs = [...(selected.photos || []).map((_, i) => ['photo', i]), ...(selected.proofPhotos || []).map((_, i) => ['proof', i])];
      const urls = await Promise.all(refs.map(([kind, i]) => MaintenanceIssueApi.getMedia(selected._id, kind, i).catch(() => null)));
      if (active) setMediaUrls(urls.filter(Boolean));
      else urls.filter(Boolean).forEach(URL.revokeObjectURL);
    };
    loadMedia();
    return () => { active = false; };
  }, [selected?._id]);
  useEffect(() => () => mediaUrls.forEach(URL.revokeObjectURL), [mediaUrls]);

  const filtered = useMemo(() => issues.filter((issue) =>
    (!filters.urgency || issue.urgency === filters.urgency) &&
    (!filters.category || issue.category === filters.category) &&
    (!filters.room || String(issue.roomId?._id || issue.roomId) === filters.room)
  ), [issues, filters]);
  const caretakerLog = role === 'caretaker' ? filtered.filter((issue) => !OPEN_FOR_WORK.includes(issue.status)) : [];
  const visibleIssues = role === 'caretaker' ? filtered.filter((issue) => OPEN_FOR_WORK.includes(issue.status)) : filtered;

  /** Runs an action, then reloads; errors go to the open dialog if there is one. */
  const act = async (action, successText, { inDialog = false } = {}) => {
    setBusy(true); setError(''); setMessage(''); setDialogError('');
    try {
      await action();
      setMessage(successText);
      await load();
      return true;
    } catch (err) {
      const text = describeApiError(err).message || 'Something went wrong. Please try again.';
      if (inDialog) setDialogError(text); else setError(text);
      return false;
    } finally { setBusy(false); }
  };

  const openReport = () => {
    setReport({ reservationId: reservations.length === 1 ? reservations[0]._id : '', category: '', urgency: 'medium', description: '' });
    setReportErrors({}); setPhotos([]); setDialogError(''); setFormOpen(true);
  };

  const submitReport = async (event) => {
    event.preventDefault();
    const errors = {
      reservationId: report.reservationId ? '' : 'Select a current tenancy.',
      category: report.category ? '' : 'Choose a category.',
      description: report.description.trim().length >= 5 ? '' : 'Describe the issue (at least 5 characters).',
    };
    setReportErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    const ok = await act(async () => {
      const data = new FormData();
      Object.entries(report).forEach(([key, value]) => data.append(key, key === 'description' ? value.trim() : value));
      photos.forEach((photo) => data.append('photos', photo));
      await MaintenanceIssueApi.create(data);
    }, 'Issue reported. Your landlord has been notified.', { inDialog: true });
    if (ok) setFormOpen(false);
  };

  const openAssign = (issue) => {
    setAssignment({
      caretakerId: issue.caretakerId?._id || '',
      internalNotes: issue.internalNotes || '',
      landlordUpdate: issue.landlordUpdate || '',
      targetDate: issue.targetDate ? new Date(issue.targetDate).toISOString().slice(0, 10) : '',
    });
    setAssignErrors({}); setDialogError(''); setAssigning(issue);
  };

  const assignIssue = async (event) => {
    event.preventDefault();
    const errors = {
      caretakerId: assignment.caretakerId ? '' : 'Choose a caretaker.',
      targetDate: !assignment.targetDate ? 'Choose a target resolution date.' : assignment.targetDate < todayInputValue() ? 'The target date cannot be in the past.' : '',
    };
    setAssignErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    const ok = await act(() => MaintenanceIssueApi.assign(assigning._id, assignment), 'Caretaker assigned and tenant notified.', { inDialog: true });
    if (ok) setAssigning(null);
  };

  const completeIssue = async () => {
    if (workSummary.trim().length < 3) { setDialogError('Add a summary of the work done (at least 3 characters).'); return; }
    const ok = await act(() => MaintenanceIssueApi.complete(completing._id, workSummary.trim()), 'Marked done. The tenant has been asked to confirm the fix.', { inDialog: true });
    if (ok) { setCompleting(null); if (selected?._id === completing._id) setSelected(null); }
  };

  const resolveIssue = async (event) => {
    event.preventDefault();
    if (resolutionNotes.trim().length < 3) { setDialogError('Add a summary of the repair work (at least 3 characters).'); return; }
    const ok = await act(async () => {
      const data = new FormData();
      data.append('resolutionNotes', resolutionNotes.trim());
      proof.forEach((file) => data.append('photos', file));
      await MaintenanceIssueApi.resolve(selected._id, data);
    }, 'Work marked done. The tenant has been asked to confirm the fix.', { inDialog: true });
    if (ok) { setSelected(null); setResolutionNotes(''); setProof([]); }
  };

  const confirmSolved = (issue) => act(() => MaintenanceIssueApi.confirm(issue._id, true), 'Thanks! The issue is now closed.').then((ok) => { if (ok && selected?._id === issue._id) setSelected(null); });

  const title = role === 'tenant' ? 'Maintenance issues' : role === 'landlord' ? 'Issue management' : 'Assigned maintenance tasks';
  const description = role === 'tenant' ? 'Report a repair and follow its progress.' : role === 'landlord' ? 'Triage reports, assign caretakers, and follow repairs.' : 'Review your assigned repairs and record completed work.';
  const reportButton = role === 'tenant' && (
    <Button onClick={openReport} disabled={!reservations.length} title={reservations.length ? undefined : 'Available once your landlord confirms your move-in'}>Report an issue</Button>
  );

  const issueActions = (issue) => {
    if (issue.removedAt) return null;
    if (role === 'tenant') {
      if (issue.status === 'awaiting_confirmation') {
        return (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button loading={busy} onClick={() => confirmSolved(issue)}>Confirm solved</Button>
            <Button variant="secondary" disabled={busy} onClick={() => { setReopenNote(''); setDialogError(''); setReopening(issue); }}>Not solved yet</Button>
          </div>
        );
      }
      if (issue.status === 'resolved') {
        return <Button className="mt-3" variant="ghost" disabled={busy} onClick={() => { setDialogError(''); setArchiving(issue); }}>Delete</Button>;
      }
      return null;
    }
    if (role === 'landlord') {
      return (
        <div className="mt-3 flex flex-wrap gap-2">
          {OPEN_FOR_WORK.includes(issue.status) && <Button variant="secondary" onClick={() => openAssign(issue)}>Assign / update</Button>}
          {OPEN_FOR_WORK.includes(issue.status) && <Button disabled={busy} onClick={() => { setWorkSummary(''); setDialogError(''); setCompleting(issue); }}>Mark as done</Button>}
          <Button variant="ghost" disabled={busy} onClick={() => { setDialogError(''); setRemoving(issue); }}>Remove report</Button>
        </div>
      );
    }
    return <Button className="mt-3" variant="ghost" disabled={busy} onClick={() => { setDialogError(''); setArchiving(issue); }}>Archive</Button>;
  };

  const issueCard = (issue) => (
    <Card key={issue._id} id={`issue-${issue._id}`} className={`hover:border-brand-300 ${highlightIssueId === issue._id ? 'ring-2 ring-amber-300' : ''}`}>
      <button type="button" className="w-full text-left" onClick={() => { setSelected(issue); setResolutionNotes(''); setProof([]); setDialogError(''); }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-gray-900">{issue.category} · Room {issue.roomId?.roomNumber}</h2>
              <Pill className={statusStyles[issue.status]}>{statusNames[issue.status] || issue.status}</Pill>
              <Pill className={urgencyStyles[issue.urgency]}>{issue.urgency} priority</Pill>
              {issue.removedAt && <Pill className="bg-red-100 text-red-800">Removed by landlord</Pill>}
            </div>
            <p className="line-clamp-2 text-sm text-gray-600">{issue.description}</p>
            <p className="mt-1 text-xs text-gray-500">{issue.propertyId?.propertyName} · Reported {formatDate(issue.createdAt)}{role !== 'tenant' && issue.tenantId?.fullName ? ` · ${issue.tenantId.fullName}` : ''}{issue.targetDate ? ` · Target ${formatDate(issue.targetDate)}` : ''}</p>
          </div>
          <span className="text-xs text-brand-700">View details</span>
        </div>
      </button>
      {issue.removedAt && role === 'tenant' && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Your landlord removed this report. Reason: {issue.removedReason}</p>}
      {issue.status === 'awaiting_confirmation' && role === 'tenant' && !issue.removedAt && issue.resolutionNotes && <p className="mt-2 text-sm text-gray-700"><span className="font-medium">Work summary:</span> {issue.resolutionNotes}</p>}
      {issueActions(issue)}
    </Card>
  );

  const openIssues = issues.filter((item) => item.status !== 'resolved');

  return <>
    {!embedded && <PageHeader title={title} description={description} actions={reportButton} />}
    {embedded && role === 'tenant' && (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{reservations.length ? 'Report a repair and follow its progress.' : 'You can report issues once your landlord confirms your move-in. Past issues stay here.'}</p>
        {reportButton}
      </div>
    )}
    <div className="mb-4 space-y-2"><ErrorBanner message={error} /><SuccessBanner message={message} /></div>
    {loading && <LoadingState label="Loading maintenance issues…" />}

    {role === 'landlord' && !loading && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['Total open', openIssues.length], ['Unassigned', issues.filter((i) => i.status === 'pending').length], ['In progress', issues.filter((i) => i.status === 'in_progress').length], ['Awaiting tenant', issues.filter((i) => i.status === 'awaiting_confirmation').length]].map(([label, value]) => <Card key={label}><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></Card>)}
    </div>}

    {role === 'landlord' && <Card className="mb-4"><div className="grid gap-3 sm:grid-cols-3">
      <Select aria-label="Filter by urgency" value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value })}><option value="">All urgency</option>{['high', 'medium', 'low'].map((x) => <option key={x} value={x}>{x}</option>)}</Select>
      <Select aria-label="Filter by category" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</Select>
      <Select aria-label="Filter by room" value={filters.room} onChange={(e) => setFilters({ ...filters, room: e.target.value })}><option value="">All room units</option>{[...new Map(issues.map((i) => [String(i.roomId?._id || i.roomId), i.roomId])).entries()].map(([id, room]) => <option key={id} value={id}>Room {room?.roomNumber || id.slice(-5)}</option>)}</Select>
    </div></Card>}

    {!loading && issues.length === 0 && <EmptyState title="No maintenance issues" description={role === 'tenant' ? 'Report a repair when something needs attention.' : role === 'landlord' ? 'New tenant reports will show here. Removed reports are in your Archive.' : 'Tasks assigned to you will show here. Archived tasks are in your Archive.'} />}
    {role === 'caretaker' && visibleIssues.length > 0 && <h2 className="mb-3 text-base font-semibold text-gray-900">Assigned jobs</h2>}
    <div className="space-y-3">{visibleIssues.map(issueCard)}</div>

    {role === 'caretaker' && <Card title="Maintenance work log" description="Jobs you marked done and closed jobs, with your repair notes." className="mt-6">
      {caretakerLog.length === 0 ? <p className="py-4 text-sm text-gray-500">Completed maintenance tasks will appear here.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[46rem] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-4">Done</th><th className="py-2 pr-4">Issue / room</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Work summary</th><th className="py-2">Actions</th></tr></thead><tbody className="divide-y divide-gray-100">{caretakerLog.map((issue) => <tr key={issue._id} id={`issue-${issue._id}`}><td className="py-3 pr-4">{formatDate(issue.doneAt || issue.resolvedAt || issue.updatedAt)}</td><td className="py-3 pr-4 font-medium">{issue.category} · Room {issue.roomId?.roomNumber}</td><td className="py-3 pr-4"><Pill className={statusStyles[issue.status]}>{statusNames[issue.status]}</Pill></td><td className="max-w-xs truncate py-3 pr-4 text-gray-600">{issue.resolutionNotes || '—'}</td><td className="py-3"><Button variant="ghost" onClick={() => setSelected(issue)}>View</Button><Button variant="ghost" disabled={busy} onClick={() => { setDialogError(''); setArchiving(issue); }}>Archive</Button></td></tr>)}</tbody></table></div>}
    </Card>}

    {formOpen && <Modal label="Report maintenance issue" wide><h2 className="mb-4 text-lg font-semibold">Report an issue</h2><form className="space-y-4" onSubmit={submitReport} noValidate>
      <ErrorBanner message={dialogError} />
      <Field required label="Apartment / room" error={reportErrors.reservationId}>
        <Select value={report.reservationId} onChange={(e) => setReport({ ...report, reservationId: e.target.value })} error={reportErrors.reservationId}>
          {/* Placeholder shows only in the closed field; it is not a selectable row. */}
          <option value="" disabled hidden>Select a current tenancy</option>
          {reservations.map((r) => <option key={r._id} value={r._id}>{r.propertyId?.propertyName} · Room {r.roomId?.roomNumber}</option>)}
        </Select>
      </Field>
      <Field required label="Category" error={reportErrors.category}>
        <Select value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value })} error={reportErrors.category}>
          <option value="" disabled hidden>Choose category</option>
          {CATEGORIES.map((x) => <option key={x}>{x}</option>)}
        </Select>
      </Field>
      <fieldset><legend className="mb-2 text-sm font-medium text-gray-700">Urgency<FieldRequirement required /></legend><div className="flex flex-wrap gap-2">{['low', 'medium', 'high'].map((value) => <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm capitalize ${report.urgency === value ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}><input type="radio" name="urgency" value={value} checked={report.urgency === value} onChange={() => setReport({ ...report, urgency: value })} />{value}</label>)}</div></fieldset>
      <Field required label="Description" error={reportErrors.description}><TextArea maxLength={3000} rows={4} value={report.description} onChange={(e) => setReport({ ...report, description: capitalizeFirst(e.target.value) })} placeholder="Describe what needs repair and where it is." error={reportErrors.description} /></Field>
      <PhotoPicker files={photos} onChange={setPhotos} />
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Send report</Button></div>
    </form></Modal>}

    {assigning && <Modal label="Assign caretaker"><h2 className="mb-4 text-lg font-semibold">Assign caretaker</h2><form className="space-y-3" onSubmit={assignIssue} noValidate>
      <ErrorBanner message={dialogError} />
      <Field required label="Caretaker" error={assignErrors.caretakerId}>
        <Select value={assignment.caretakerId} onChange={(e) => setAssignment({ ...assignment, caretakerId: e.target.value })} error={assignErrors.caretakerId}>
          <option value="" disabled hidden>Choose caretaker</option>
          {caretakers.map((c) => <option key={c._id} value={c._id}>{c.fullName}</option>)}
        </Select>
      </Field>
      <Field required label="Target resolution date" error={assignErrors.targetDate}><TextInput type="date" min={todayInputValue()} value={assignment.targetDate} onChange={(e) => setAssignment({ ...assignment, targetDate: e.target.value })} error={assignErrors.targetDate} /></Field>
      <Field label="Internal instructions"><TextArea rows={3} maxLength={2000} value={assignment.internalNotes} onChange={(e) => setAssignment({ ...assignment, internalNotes: e.target.value })} placeholder="Instructions for the caretaker" /></Field>
      <Field label="Update for tenant"><TextArea rows={2} maxLength={2000} value={assignment.landlordUpdate} onChange={(e) => setAssignment({ ...assignment, landlordUpdate: e.target.value })} placeholder="Visible update about the repair" /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAssigning(null)}>Cancel</Button><Button type="submit" loading={busy}>Assign caretaker</Button></div>
    </form></Modal>}

    <ConfirmDialog
      open={Boolean(completing)}
      title="Mark this issue as done?"
      message="The tenant will see your work summary and be asked to confirm the fix."
      confirmLabel="Mark as done"
      loading={busy}
      error={dialogError}
      onConfirm={completeIssue}
      onCancel={() => setCompleting(null)}
    >
      <Field required label="Work summary"><TextArea rows={3} maxLength={2000} value={workSummary} onChange={(e) => setWorkSummary(capitalizeFirst(e.target.value))} placeholder="What was done to fix it?" /></Field>
    </ConfirmDialog>

    <ConfirmDialog
      open={Boolean(reopening)}
      title="Not solved yet?"
      message="The issue will be reopened and your landlord and the caretaker will be notified."
      confirmLabel="Reopen issue"
      loading={busy}
      error={dialogError}
      onConfirm={async () => { const ok = await act(() => MaintenanceIssueApi.confirm(reopening._id, false, reopenNote.trim()), 'The issue was reopened. Your landlord has been notified.', { inDialog: true }); if (ok) { setReopening(null); setSelected(null); } }}
      onCancel={() => setReopening(null)}
    >
      <Field label="What is still wrong?"><TextArea rows={2} maxLength={2000} value={reopenNote} onChange={(e) => setReopenNote(capitalizeFirst(e.target.value))} placeholder="Optional details for your landlord" /></Field>
    </ConfirmDialog>

    <ConfirmDialog
      open={Boolean(archiving)}
      title={role === 'tenant' ? 'Delete this issue?' : 'Archive this task?'}
      message={role === 'tenant' ? 'It moves to your Archive (in the account menu), where you can restore it. Your landlord keeps the record.' : 'It moves to your Archive (in the account menu) and only disappears from your list. Nothing changes for the landlord or tenant.'}
      confirmLabel={role === 'tenant' ? 'Move to Archive' : 'Archive'}
      loading={busy}
      error={dialogError}
      onConfirm={async () => { const ok = await act(() => MaintenanceIssueApi.archive(archiving._id), 'Moved to your Archive.', { inDialog: true }); if (ok) setArchiving(null); }}
      onCancel={() => setArchiving(null)}
    />

    <ReasonDialog
      open={Boolean(removing)}
      title="Remove this report?"
      message="The tenant will be notified and will see the reason. The report moves to your Archive, where you can restore it."
      reasons={REMOVE_REASONS}
      confirmLabel="Remove report"
      loading={busy}
      error={dialogError}
      onConfirm={async (reason) => { const ok = await act(() => MaintenanceIssueApi.remove(removing._id, reason), 'Report removed. The tenant has been notified.', { inDialog: true }); if (ok) { setRemoving(null); setSelected(null); } }}
      onCancel={() => setRemoving(null)}
    />

    {selected && <Modal label="Issue details" wide><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{selected.category} · Room {selected.roomId?.roomNumber}</h2><p className="mt-1 text-sm text-gray-500">{selected.propertyId?.propertyName}</p></div><Button variant="ghost" onClick={() => setSelected(null)}>Close</Button></div>
      <div className="my-4 flex flex-wrap gap-2"><Pill className={statusStyles[selected.status]}>{statusNames[selected.status] || selected.status}</Pill><Pill className={urgencyStyles[selected.urgency]}>{selected.urgency} priority</Pill>{selected.removedAt && <Pill className="bg-red-100 text-red-800">Removed by landlord</Pill>}</div>
      {selected.removedAt && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Removed {formatDate(selected.removedAt)}. Reason: {selected.removedReason}</p>}
      <p className="whitespace-pre-wrap text-sm text-gray-700">{selected.description}</p>
      {mediaUrls.length > 0 && <div className="mt-4 grid grid-cols-3 gap-2">{mediaUrls.map((url, index) => <img key={url} src={url} alt={`Issue attachment ${index + 1}`} className="h-24 w-full rounded-lg border object-cover" />)}</div>}
      <dl className="mt-4 space-y-2 border-t pt-4 text-sm"><div><dt className="text-gray-500">Assigned caretaker</dt><dd className="font-medium">{selected.caretakerId?.fullName || 'Waiting for assignment'}</dd></div>{selected.targetDate && <div><dt className="text-gray-500">Target date</dt><dd>{formatDate(selected.targetDate)}</dd></div>}{selected.landlordUpdate && <div><dt className="text-gray-500">Landlord update</dt><dd>{selected.landlordUpdate}</dd></div>}{selected.internalNotes && role !== 'tenant' && <div><dt className="text-gray-500">Internal instructions</dt><dd>{selected.internalNotes}</dd></div>}{selected.resolutionNotes && <div><dt className="text-gray-500">Work summary</dt><dd>{selected.resolutionNotes}</dd></div>}</dl>
      {selected.statusHistory?.length > 0 && <div className="mt-4 border-t pt-4"><h3 className="mb-2 text-sm font-semibold text-gray-900">Status history</h3><ol className="space-y-1.5 text-sm">{selected.statusHistory.map((entry, index) => <li key={`${entry.event}-${index}`} className="flex flex-col sm:flex-row sm:gap-2"><span className="shrink-0 text-xs text-gray-500 sm:w-40">{formatDateTime(entry.at)}</span><span className="text-gray-700">{HISTORY_LABEL[entry.event] || entry.event}{entry.note ? ` — ${entry.note}` : ''}</span></li>)}</ol></div>}
      {role === 'tenant' && !selected.removedAt && selected.status === 'awaiting_confirmation' && <div className="mt-5 flex flex-wrap gap-2 border-t pt-4"><Button loading={busy} onClick={() => confirmSolved(selected)}>Confirm solved</Button><Button variant="secondary" disabled={busy} onClick={() => { setReopenNote(''); setDialogError(''); setReopening(selected); }}>Not solved yet</Button></div>}
      {role === 'caretaker' && OPEN_FOR_WORK.includes(selected.status) && <form className="mt-5 space-y-3 border-t pt-4" onSubmit={resolveIssue} noValidate><ErrorBanner message={dialogError} /><Field required label="Work summary"><TextArea maxLength={2000} rows={3} value={resolutionNotes} onChange={(e) => setResolutionNotes(capitalizeFirst(e.target.value))} placeholder="Summarize the repair work" /></Field><PhotoPicker files={proof} onChange={setProof} label="Proof of work photos" /><Button type="submit" loading={busy}>Mark as done</Button></form>}
      {role === 'caretaker' && selected.tenantId?.phone && <div className="mt-4 flex gap-2"><a className="rounded-lg border px-3 py-2 text-sm text-brand-700" href={`tel:${selected.tenantId.phone}`}>Call tenant</a><a className="rounded-lg border px-3 py-2 text-sm text-brand-700" href={`sms:${selected.tenantId.phone}`}>Message tenant</a></div>}
    </Modal>}
  </>;
}

export default function MaintenanceIssuesPage() {
  const [searchParams] = useSearchParams();
  return <DashboardLayout><MaintenanceIssuesContent highlightIssueId={searchParams.get('issue')} /></DashboardLayout>;
}
