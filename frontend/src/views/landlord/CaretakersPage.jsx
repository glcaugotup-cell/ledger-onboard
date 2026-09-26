import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import CaretakerApi from '../../services/CaretakerApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { DAGUPAN_BARANGAYS } from '../../data/dagupanBarangays.js';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst, toNameCase } from '../../utils/textFormat.js';
import { sanitizePhoneInput, validateGmail, validateName, validatePhone } from '../../utils/validators.js';

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
        className="w-52"
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
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Invite a caretaker" className="lg:col-span-1">
          <form onSubmit={onCreate} className="space-y-3" noValidate>
            <ErrorBanner message={createError} />
            <SuccessBanner message={successMsg} />
            <Field label="First name" error={formErrors.firstName}>
              <TextInput value={form.firstName} onChange={(e) => setField('firstName', capitalizeFirst(e.target.value))} error={formErrors.firstName} />
            </Field>
            <Field label="Last name" error={formErrors.lastName}>
              <TextInput value={form.lastName} onChange={(e) => setField('lastName', capitalizeFirst(e.target.value))} error={formErrors.lastName} />
            </Field>
            <Field label="Email (Gmail only)" error={formErrors.email}>
              <TextInput type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} error={formErrors.email} />
            </Field>
            <Field label="Phone" error={formErrors.phone}>
              <TextInput inputMode="tel" maxLength={13} value={form.phone} onChange={(e) => setField('phone', sanitizePhoneInput(e.target.value))} error={formErrors.phone} />
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

        <div className="lg:col-span-2">
          <ErrorBanner message={error} />
          {loading && <LoadingState />}
          {!loading && caretakers.length === 0 && <EmptyState title="No caretakers yet" description="Invite one using the form on the left." />}
          <div className="space-y-3">
            {caretakers.map((c) => (
              <Card key={c._id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">{c.fullName}</p>
                    <p className="break-all text-sm text-gray-500">{c.email}</p>
                    <p className="text-xs text-gray-500">{c.phone}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Works in: <span className="font-medium text-gray-700">{c.serviceBarangay || 'not set yet'}</span>
                    </p>
                    <ServiceAreaEditor caretaker={c} onSaved={(updated) => setCaretakers((prev) => prev.map((x) => (x._id === updated._id ? updated : x)))} />
                  </div>
                  <StatusBadge status={c.accountStatus} tones={STATUS_TONE} />
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
