import { useEffect, useState } from 'react';
import { UserPlusIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import CaretakerApi from '../../services/CaretakerApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import PhoneInput from '../../components/ui/PhoneInput.jsx';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { DAGUPAN_BARANGAYS } from '../../data/dagupanBarangays.js';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst, toNameCase } from '../../utils/textFormat.js';
import { validateGmail, validateName, validatePhone } from '../../utils/validators.js';
import { initials } from '../../utils/format.js';

const STATUS_TONE = { active: 'green', pending_activation: 'yellow', suspended: 'red', deactivated: 'gray', archived: 'gray' };
const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', serviceBarangay: '' };

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

    const payload = { ...form, firstName: toNameCase(form.firstName.trim()), lastName: toNameCase(form.lastName.trim()), email: form.email.trim().toLowerCase() };
    setForm(payload);
    // Validate each field before the request goes out.
    const errors = {
      firstName: validateName(payload.firstName),
      lastName: validateName(payload.lastName),
      email: validateGmail(payload.email),
      phone: validatePhone(payload.phone),
      serviceBarangay: payload.serviceBarangay ? null : 'Select the barangay this caretaker works in',
    };
    const hasErrors = Object.values(errors).some(Boolean);
    setFormErrors(Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg)));
    if (hasErrors) return;

    setCreateLoading(true);
    try {
      await CaretakerApi.create(payload);
      setSuccessMsg(`Invitation sent to ${payload.email}. They'll receive an activation email.`);
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First name" error={formErrors.firstName}>
                <TextInput maxLength={80} value={form.firstName} onChange={(e) => setField('firstName', capitalizeFirst(e.target.value))} error={formErrors.firstName} />
              </Field>
              <Field label="Last name" error={formErrors.lastName}>
                <TextInput maxLength={80} value={form.lastName} onChange={(e) => setField('lastName', capitalizeFirst(e.target.value))} error={formErrors.lastName} />
              </Field>
            </div>
            <Field label="Email (Gmail only)" error={formErrors.email}>
              <TextInput type="email" maxLength={254} value={form.email} onChange={(e) => setField('email', e.target.value)} error={formErrors.email} />
            </Field>
            <Field label="Phone (+63)" error={formErrors.phone}>
              <PhoneInput value={form.phone} onChange={(value) => setField('phone', value)} error={formErrors.phone} placeholder="917 123 4567" />
            </Field>
            <Field label="Service barangay" error={formErrors.serviceBarangay}>
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
    </DashboardLayout>
  );
}
