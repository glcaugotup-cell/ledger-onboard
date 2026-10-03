import { useEffect, useState } from 'react';
import { UserPlusIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import CaretakerApi from '../../services/CaretakerApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import PhoneInput from '../../components/ui/PhoneInput.jsx';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { DAGUPAN_BARANGAYS } from '../../data/dagupanBarangays.js';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst, toNameCase } from '../../utils/textFormat.js';
import { validateGmail, validatePhone } from '../../utils/validators.js';
import { initials } from '../../utils/format.js';

const STATUS_TONE = { active: 'green', pending_activation: 'yellow', suspended: 'red', deactivated: 'gray', archived: 'gray' };
const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', serviceBarangay: '' };
const FIRST_NAME_MAX_LENGTH = 15;
const LAST_NAME_MAX_LENGTH = 20;

function validateCaretakerName(value, maxLength) {
  if (!value) return 'This field is required';
  if ((value.match(/[A-Za-z]/g) || []).length < 2) return 'Must contain at least 2 letters';
  if (value.length > maxLength) return `Must be ${maxLength} characters or fewer`;
  if (!/^[A-Za-z ]+$/.test(value)) return 'Use letters and spaces only';
  return null;
}

function BarangayOptions() {
  return DAGUPAN_BARANGAYS.map((b) => (
    <option key={b.id} value={b.name}>
      {b.name}
    </option>
  ));
}

/** Lets the landlord set or change where an existing caretaker works (used for location-based suggestions). */
function ServiceAreaEditor({ caretaker, onSaved }) {
  const [value, setValue] = useState(caretaker.serviceBarangay || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const changed = value !== (caretaker.serviceBarangay || '');

  const save = async () => {
    if (!value) {
      setError('Select a barangay.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { caretaker: updated } = await CaretakerApi.update(caretaker._id, { serviceBarangay: value });
      onSaved(updated);
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Field required label="Service barangay">
      <Select
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError('');
        }}
        aria-label={`Service barangay for ${caretaker.fullName}`}
        className="w-full sm:w-52"
      >
        <option value="">Service barangay…</option>
        <BarangayOptions />
      </Select>
      </Field>
      {changed && (
        <Button variant="secondary" loading={saving} onClick={save}>
          Save
        </Button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}

export default function CaretakersPage() {
  const [caretakers, setCaretakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState({});
  const [createError, setCreateError] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [createdTemporaryPassword, setCreatedTemporaryPassword] = useState('');
  const [removing, setRemoving] = useState(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removeError, setRemoveError] = useState('');
  const [removeLoading, setRemoveLoading] = useState(false);

  const removeCaretaker = async () => {
    setRemoveLoading(true);
    setRemoveError('');
    try {
      await CaretakerApi.remove(removing._id, removeReason.trim());
      setCaretakers((items) => items.filter((item) => item._id !== removing._id));
      setRemoving(null);
      setRemoveReason('');
      setSuccessMsg(`${removing.fullName}'s account has been deactivated.`);
    } catch (err) {
      setRemoveError(describeApiError(err).message);
    } finally {
      setRemoveLoading(false);
    }
  };

  const load = () => {
    setLoading(true);
    CaretakerApi.list()
      .then(({ caretakers: list }) => setCaretakers(list))
      .catch(() => setError('Could not load caretakers.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (formErrors[key]) setFormErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const onCreate = async (e) => {
    e.preventDefault();
    setCreateError('');
    setSuccessMsg('');
    setCreatedTemporaryPassword('');

    const payload = { ...form, firstName: toNameCase(form.firstName.trim()), lastName: toNameCase(form.lastName.trim()), email: `${form.email.trim().toLowerCase()}@gmail.com` };
    // Validate each field before the request goes out.
    const errors = {
      firstName: validateCaretakerName(payload.firstName, FIRST_NAME_MAX_LENGTH),
      lastName: validateCaretakerName(payload.lastName, LAST_NAME_MAX_LENGTH),
      email: validateGmail(payload.email),
      phone: validatePhone(payload.phone),
      serviceBarangay: payload.serviceBarangay ? null : 'Select the barangay this caretaker works in',
    };
    const hasErrors = Object.values(errors).some(Boolean);
    setFormErrors(Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg)));
    if (hasErrors) return;

    setCreateLoading(true);
    try {
      const created = await CaretakerApi.create(payload);
      setSuccessMsg(`Caretaker account created for ${payload.email}. They must activate it and change the temporary password before accessing the dashboard.`);
      setCreatedTemporaryPassword(created.temporaryPassword || 'caretaker1234');
      setForm(EMPTY_FORM);
      setFormErrors({});
      load();
    } catch (err) {
      const { message, fieldErrors } = describeApiError(err);
      setCreateError(message);
      setFormErrors(fieldErrors);
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Caretakers" description="Invite caretakers and set the barangay each one works in." />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(19rem,0.95fr)_minmax(0,1.65fr)]">
        <Card className="rounded-2xl border-gray-200/80 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100"><UserPlusIcon className="h-5 w-5" aria-hidden="true" /></span>
            <div><h2 className="font-semibold text-gray-900">Invite a caretaker</h2><p className="mt-0.5 text-xs text-gray-500">Send an activation link to a trusted team member.</p></div>
          </div>
          <form onSubmit={onCreate} className="space-y-3" noValidate>
            <ErrorBanner message={createError} />
            <SuccessBanner message={successMsg} />
            {createdTemporaryPassword && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-semibold">Temporary password</p><p className="mt-1 font-mono text-base">{createdTemporaryPassword}</p><p className="mt-1 text-xs">Share it with the caretaker. The activation page requires them to set a new password before they can use the account.</p></div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field required label="First name" error={formErrors.firstName}>
                <TextInput maxLength={FIRST_NAME_MAX_LENGTH} value={form.firstName} onChange={(e) => setField('firstName', capitalizeFirst(e.target.value.replace(/[^A-Za-z ]/g, '')))} error={formErrors.firstName} />
              </Field>
              <Field required label="Last name" error={formErrors.lastName}>
                <TextInput maxLength={LAST_NAME_MAX_LENGTH} value={form.lastName} onChange={(e) => setField('lastName', capitalizeFirst(e.target.value.replace(/[^A-Za-z ]/g, '')))} error={formErrors.lastName} />
              </Field>
            </div>
            <Field required label="Email (Gmail only)" error={formErrors.email}>
              <div className="flex">
                <TextInput type="text" inputMode="email" maxLength={64} value={form.email} onChange={(e) => setField('email', e.target.value.replace(/@gmail\.com$/i, '').replace(/[^A-Za-z0-9._%+-]/g, ''))} error={formErrors.email} className="min-w-0 rounded-r-none" aria-label="Gmail username" />
                <span className={`flex min-h-[2.5rem] items-center rounded-r-lg border border-l-0 px-3 text-sm ${formErrors.email ? 'border-red-400 text-gray-500' : 'border-gray-300 text-gray-600'}`}>@gmail.com</span>
              </div>
            </Field>
            <Field required label="Phone (+63)" error={formErrors.phone}>
              <PhoneInput value={form.phone} onChange={(value) => setField('phone', value)} error={formErrors.phone} placeholder="917 123 4567" />
            </Field>
            <Field required label="Service barangay" error={formErrors.serviceBarangay}>
              <Select value={form.serviceBarangay} onChange={(e) => setField('serviceBarangay', e.target.value)} error={formErrors.serviceBarangay}>
                <option value="">Select a barangay…</option>
                <BarangayOptions />
              </Select>
            </Field>
            <p className="-mt-1 text-xs text-gray-500">Where this caretaker works. Used to suggest them for boarding houses in the same barangay.</p>
            <Button type="submit" loading={createLoading} className="w-full">
              Send activation invite
            </Button>
          </form>
        </Card>

        <section aria-labelledby="caretaker-list-heading" className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-gray-200/80 bg-white px-4 py-3 shadow-sm sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <UserGroupIcon className="h-5 w-5 shrink-0 text-brand-700" aria-hidden="true" />
              <div className="min-w-0"><h2 id="caretaker-list-heading" className="font-semibold text-gray-900">Your caretakers</h2><p className="truncate text-xs text-gray-500">Manage access and service areas</p></div>
            </div>
            <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">{loading ? '…' : caretakers.length}</span>
          </div>
          <ErrorBanner message={error} />
          {loading && <LoadingState />}
          {!loading && caretakers.length === 0 && <EmptyState title="No caretakers yet" description="Your invited team members will appear here." />}
          <div className="space-y-3">
            {caretakers.map((c) => (
              <Card key={c._id} className="overflow-hidden rounded-2xl border-gray-200/80 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800" aria-hidden="true">{initials(c.fullName)}</span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{c.fullName}</p>
                      <p className="truncate text-sm text-gray-500">{c.email}</p>
                    </div>
                  </div>
                  <StatusBadge status={c.accountStatus} tones={STATUS_TONE} />
                  {c.accountStatus === 'pending_activation' && <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Must set password</span>}
                  {c.accountStatus === 'active' && <Button variant="danger" onClick={() => { setRemoving(c); setRemoveReason(''); setRemoveError(''); }}>Remove</Button>}
                </div>
                <div className="mt-4 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2 xl:grid-cols-[minmax(8rem,0.8fr)_minmax(10rem,1fr)_minmax(14rem,1.4fr)]">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Phone</p>
                    <p className="mt-1 truncate text-sm font-medium text-gray-700">{c.phone || 'Not provided'}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Service area</p>
                    <p className="mt-1 truncate text-sm font-medium text-gray-700">{c.serviceBarangay || 'Not assigned'}</p>
                  </div>
                  <div className="min-w-0 sm:col-span-2 xl:col-span-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">Update service area</p>
                    <ServiceAreaEditor caretaker={c} onSaved={(updated) => setCaretakers((prev) => prev.map((x) => (x._id === updated._id ? updated : x)))} />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
      <ConfirmDialog open={Boolean(removing)} tone="danger" title={removing ? `Remove ${removing.fullName}?` : ''} message="Their sign-in access will end. Existing readings, payments, and audit records will remain on file." confirmLabel="Remove caretaker" loading={removeLoading} confirmDisabled={removeReason.trim().length < 3} error={removeError} onConfirm={removeCaretaker} onCancel={() => setRemoving(null)}>
        <Field required label="Reason for removal">
          <TextArea rows={3} maxLength={500} value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} placeholder="Explain why this caretaker is being removed" />
        </Field>
      </ConfirmDialog>
    </DashboardLayout>
  );
}
