import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, FieldRequirement, Select, TextArea, TextInput } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import CaretakerApi from '../../services/CaretakerApi.js';
import MaintenanceIssueApi from '../../services/MaintenanceIssueApi.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { formatDate } from '../../utils/format.js';

const CATEGORIES = ['Plumbing', 'Electrical', 'Appliance', 'Structural', 'Pest control', 'Cleaning', 'Other'];
const statusNames = { pending: 'Pending', in_progress: 'In Progress', resolved: 'Resolved' };
const statusStyles = { pending: 'bg-amber-100 text-amber-800', in_progress: 'bg-blue-100 text-blue-800', resolved: 'bg-green-100 text-green-800' };
const urgencyStyles = { low: 'bg-gray-100 text-gray-700', medium: 'bg-amber-100 text-amber-800', high: 'bg-red-100 text-red-800' };

function Pill({ className = '', children }) { return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{children}</span>; }

export default function MaintenanceIssuesPage() {
  const { user } = useAuth();
  const role = user?.role;
  const [issues, setIssues] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [caretakers, setCaretakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [urgency, setUrgency] = useState('medium');
  const [description, setDescription] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [photos, setPhotos] = useState([]);
  const [filters, setFilters] = useState({ urgency: '', category: '', room: '' });
  const [assigning, setAssigning] = useState(null);
  const [assignee, setAssignee] = useState('');
  const [notes, setNotes] = useState('');
  const [landlordUpdate, setLandlordUpdate] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [proof, setProof] = useState([]);
  const [busy, setBusy] = useState(false);
  const [mediaUrls, setMediaUrls] = useState([]);

  const load = async () => {
    try {
      const [issueResponse, relatedResponse] = await Promise.all([
        MaintenanceIssueApi.list(),
        role === 'tenant' ? ReservationApi.list() : role === 'landlord' ? CaretakerApi.list() : Promise.resolve(null),
      ]);
      const rows = issueResponse.issues;
      setIssues(rows);
      if (role === 'tenant') setReservations(relatedResponse.reservations.filter((item) => item.status === 'approved'));
      if (role === 'landlord') setCaretakers(relatedResponse.caretakers.filter((item) => item.accountStatus === 'active'));
      setError('');
    } catch { setError('Could not load maintenance issues.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [role]);

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
  const today = new Date().toDateString();
  const caretakerHistory = role === 'caretaker' ? filtered.filter((issue) => issue.status === 'resolved') : [];
  const visibleIssues = role === 'caretaker' ? filtered.filter((issue) => issue.status !== 'resolved') : filtered;

  const submitReport = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = new FormData(); data.append('reservationId', reservationId); data.append('category', category); data.append('urgency', urgency); data.append('description', description);
      [...photos].forEach((photo) => data.append('photos', photo));
      await MaintenanceIssueApi.create(data);
      setFormOpen(false); setDescription(''); setPhotos([]); setMessage('Issue reported. Your landlord has been notified.'); await load();
    } catch (err) { setError(err.message || 'Could not submit this issue.'); }
    finally { setBusy(false); }
  };

  const assignIssue = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await MaintenanceIssueApi.assign(assigning._id, { caretakerId: assignee, internalNotes: notes, landlordUpdate, targetDate: targetDate || undefined });
      setAssigning(null); setMessage('Caretaker assigned and tenant notified.'); await load();
    } catch (err) { setError(err.message || 'Could not assign this issue.'); }
    finally { setBusy(false); }
  };

  const resolveIssue = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = new FormData(); data.append('resolutionNotes', resolutionNotes); [...proof].forEach((file) => data.append('photos', file));
      await MaintenanceIssueApi.resolve(selected._id, data); setSelected(null); setResolutionNotes(''); setProof([]); setMessage('Work marked resolved.'); await load();
    } catch (err) { setError(err.message || 'Could not submit resolution.'); }
    finally { setBusy(false); }
  };

  const completeIssue = async (issue) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await MaintenanceIssueApi.complete(issue._id);
      if (selected?._id === issue._id) setSelected(null);
      setMessage('Task marked done. The tenant has been notified.');
      await load();
    } catch (err) { setError(err.message || 'Could not mark this task done.'); }
    finally { setBusy(false); }
  };

  const title = role === 'tenant' ? 'Maintenance issues' : role === 'landlord' ? 'Issue management' : 'Assigned maintenance tasks';
  const openIssues = issues.filter((item) => item.status !== 'resolved');

  return <DashboardLayout>
    <PageHeader title={title} description={role === 'tenant' ? 'Report a repair and follow its progress.' : role === 'landlord' ? 'Triage reports, assign caretakers, and follow repairs.' : 'Review your assigned repairs and record completed work.'} actions={role === 'tenant' && <Button onClick={() => setFormOpen(true)} disabled={!reservations.length}>Report an issue</Button>} />
    <div className="mb-4 space-y-2"><ErrorBanner message={error} /><SuccessBanner message={message} /></div>
    {loading && <LoadingState label="Loading maintenance issues…" />}

    {role === 'landlord' && !loading && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[['Total open', openIssues.length], ['Unassigned', issues.filter((i) => i.status === 'pending').length], ['In progress', issues.filter((i) => i.status === 'in_progress').length], ['Resolved today', issues.filter((i) => i.status === 'resolved' && i.resolvedAt && new Date(i.resolvedAt).toDateString() === today).length]].map(([label, value]) => <Card key={label}><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{value}</p></Card>)}
    </div>}

    {role === 'landlord' && <Card className="mb-4"><div className="grid gap-3 sm:grid-cols-3">
      <Select aria-label="Filter by urgency" value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value })}><option value="">All urgency</option>{['high', 'medium', 'low'].map((x) => <option key={x} value={x}>{x}</option>)}</Select>
      <Select aria-label="Filter by category" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All categories</option>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</Select>
      <Select aria-label="Filter by room" value={filters.room} onChange={(e) => setFilters({ ...filters, room: e.target.value })}><option value="">All room units</option>{[...new Map(issues.map((i) => [String(i.roomId?._id || i.roomId), i.roomId])).entries()].map(([id, room]) => <option key={id} value={id}>Room {room?.roomNumber || id.slice(-5)}</option>)}</Select>
    </div></Card>}

    {!loading && issues.length === 0 && <EmptyState title="No maintenance issues" description={role === 'tenant' ? 'Report a repair when something needs attention.' : 'New tenant reports will show here.'} />}
    {role === 'caretaker' && visibleIssues.length > 0 && <h2 className="mb-3 text-base font-semibold text-gray-900">Assigned jobs</h2>}
    <div className="space-y-3">{visibleIssues.map((issue) => <Card key={issue._id} className="cursor-pointer hover:border-brand-300" >
      <button type="button" className="w-full text-left" onClick={() => { setSelected(issue); setResolutionNotes(''); setProof([]); }}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-1 flex flex-wrap items-center gap-2"><h2 className="font-semibold text-gray-900">{issue.category} · Room {issue.roomId?.roomNumber}</h2><Pill className={statusStyles[issue.status]}>{statusNames[issue.status]}</Pill><Pill className={urgencyStyles[issue.urgency]}>{issue.urgency} priority</Pill></div><p className="line-clamp-2 text-sm text-gray-600">{issue.description}</p><p className="mt-1 text-xs text-gray-500">{issue.propertyId?.propertyName} · Reported {formatDate(issue.createdAt)}{role !== 'tenant' && issue.tenantId?.fullName ? ` · ${issue.tenantId.fullName}` : ''}</p></div><span className="text-xs text-brand-700">View details</span></div>
      </button>
      {role === 'landlord' && issue.status !== 'resolved' && <Button className="mt-3" variant="secondary" onClick={() => { setAssigning(issue); setAssignee(issue.caretakerId?._id || ''); setNotes(issue.internalNotes || ''); setLandlordUpdate(issue.landlordUpdate || ''); setTargetDate(issue.targetDate ? new Date(issue.targetDate).toISOString().slice(0, 10) : ''); }}>Assign / update</Button>}
      {role === 'landlord' && issue.status !== 'resolved' && <Button className="ml-2 mt-3" loading={busy} disabled={busy} onClick={() => completeIssue(issue)}>Mark task done</Button>}
    </Card>)}</div>
    {role === 'caretaker' && <Card title="Maintenance work log" description="Completed jobs and the repair notes you submitted." className="mt-6">
      {caretakerHistory.length === 0 ? <p className="py-4 text-sm text-gray-500">Resolved maintenance tasks will appear here.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[42rem] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-4">Resolved</th><th className="py-2 pr-4">Issue / room</th><th className="py-2 pr-4">Priority</th><th className="py-2 pr-4">Work summary</th><th className="py-2">Details</th></tr></thead><tbody className="divide-y divide-gray-100">{caretakerHistory.map((issue) => <tr key={issue._id}><td className="py-3 pr-4">{formatDate(issue.resolvedAt || issue.updatedAt)}</td><td className="py-3 pr-4 font-medium">{issue.category} · Room {issue.roomId?.roomNumber}</td><td className="py-3 pr-4"><Pill className={urgencyStyles[issue.urgency]}>{issue.urgency}</Pill></td><td className="max-w-xs truncate py-3 pr-4 text-gray-600">{issue.resolutionNotes || '—'}</td><td className="py-3"><Button variant="ghost" onClick={() => setSelected(issue)}>View</Button></td></tr>)}</tbody></table></div>}
    </Card>}

    {formOpen && <section className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Report maintenance issue"><Card className="w-full max-w-xl"><h2 className="mb-4 text-lg font-semibold">Report an issue</h2><form className="space-y-4" onSubmit={submitReport}>
      <Field required label="Apartment / room"><Select required value={reservationId} onChange={(e) => setReservationId(e.target.value)}><option value="">Select a current tenancy</option>{reservations.map((r) => <option key={r._id} value={r._id}>{r.propertyId?.propertyName} · Room {r.roomId?.roomNumber}</option>)}</Select></Field>
      <Field required label="Category"><Select required value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Choose category</option>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
      <fieldset><legend className="mb-2 text-sm font-medium text-gray-700">Urgency<FieldRequirement required /></legend><div className="flex gap-2">{['low', 'medium', 'high'].map((value) => <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm capitalize ${urgency === value ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}><input type="radio" name="urgency" value={value} checked={urgency === value} onChange={() => setUrgency(value)} />{value}</label>)}</div></fieldset>
      <Field required label="Description"><TextArea required minLength={5} maxLength={3000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe what needs repair and where it is." /></Field>
      <Field label="Photos"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(e) => setPhotos(Array.from(e.target.files || []).slice(0, 5))} /><span className="mt-1 block text-xs text-gray-500">Up to 5 photos, JPG/PNG/WEBP.</span></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button><Button type="submit" loading={busy} disabled={!reservationId || !category}>Send report</Button></div>
    </form></Card></section>}

    {assigning && <section className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Assign caretaker"><Card className="w-full max-w-lg"><h2 className="mb-4 text-lg font-semibold">Assign caretaker</h2><form className="space-y-3" onSubmit={assignIssue}>
      <Field required label="Caretaker"><Select required value={assignee} onChange={(e) => setAssignee(e.target.value)}><option value="">Choose caretaker</option>{caretakers.map((c) => <option key={c._id} value={c._id}>{c.fullName}</option>)}</Select></Field>
      <Field label="Internal instructions"><TextArea rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Instructions for the caretaker" /></Field>
      <Field label="Update for tenant"><TextArea rows={2} maxLength={2000} value={landlordUpdate} onChange={(e) => setLandlordUpdate(e.target.value)} placeholder="Visible update about the repair" /></Field>
      <Field label="Target resolution date"><TextInput type="date" min={new Date().toISOString().slice(0, 10)} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setAssigning(null)}>Cancel</Button><Button type="submit" loading={busy} disabled={!assignee}>Assign caretaker</Button></div>
    </form></Card></section>}

    {selected && <section className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Issue details"><Card className="max-h-[90vh] w-full max-w-xl overflow-auto"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{selected.category} · Room {selected.roomId?.roomNumber}</h2><p className="mt-1 text-sm text-gray-500">{selected.propertyId?.propertyName}</p></div><Button variant="ghost" onClick={() => setSelected(null)}>Close</Button></div>
      <div className="my-4 flex gap-2"><Pill className={statusStyles[selected.status]}>{statusNames[selected.status]}</Pill><Pill className={urgencyStyles[selected.urgency]}>{selected.urgency} priority</Pill></div><p className="whitespace-pre-wrap text-sm text-gray-700">{selected.description}</p>
      {mediaUrls.length > 0 && <div className="mt-4 grid grid-cols-3 gap-2">{mediaUrls.map((url, index) => <img key={url} src={url} alt={`Issue attachment ${index + 1}`} className="h-24 w-full rounded-lg border object-cover" />)}</div>}
      <dl className="mt-4 space-y-2 border-t pt-4 text-sm"><div><dt className="text-gray-500">Assigned caretaker</dt><dd className="font-medium">{selected.caretakerId?.fullName || 'Waiting for assignment'}</dd></div>{selected.targetDate && <div><dt className="text-gray-500">Target date</dt><dd>{formatDate(selected.targetDate)}</dd></div>}{selected.landlordUpdate && <div><dt className="text-gray-500">Landlord update</dt><dd>{selected.landlordUpdate}</dd></div>}{selected.internalNotes && role !== 'tenant' && <div><dt className="text-gray-500">Internal instructions</dt><dd>{selected.internalNotes}</dd></div>}{selected.resolutionNotes && <div><dt className="text-gray-500">Work summary</dt><dd>{selected.resolutionNotes}</dd></div>}</dl>
      {role === 'caretaker' && selected.status !== 'resolved' && <form className="mt-5 space-y-3 border-t pt-4" onSubmit={resolveIssue}><Field required label="Resolution notes"><TextArea required minLength={3} maxLength={2000} rows={3} value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Summarize repair work" /></Field><Field label="Proof of work photo"><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(e) => setProof(Array.from(e.target.files || []).slice(0, 5))} /></Field><Button type="submit" loading={busy}>Mark resolved</Button></form>}
      {role === 'caretaker' && selected.tenantId?.phone && <div className="mt-4 flex gap-2"><a className="rounded-lg border px-3 py-2 text-sm text-brand-700" href={`tel:${selected.tenantId.phone}`}>Call tenant</a><a className="rounded-lg border px-3 py-2 text-sm text-brand-700" href={`sms:${selected.tenantId.phone}`}>Message tenant</a></div>}
    </Card></section>}
  </DashboardLayout>;
}
