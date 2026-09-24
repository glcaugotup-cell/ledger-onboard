import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import CaretakerApi from '../../services/CaretakerApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { sanitizePhoneInput, validateGmail, validateName, validatePhone } from '../../utils/validators.js';

const STATUS_TONE = { active: 'green', pending_activation: 'yellow', suspended: 'red', deactivated: 'gray', archived: 'gray' };

export default function CaretakersPage() {
  const [caretakers, setCaretakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '' });
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

  const onCreate = async (e) => {
    e.preventDefault();
    setCreateError('');

    // Validate each field before the request goes out.
    const errors = {
      firstName: validateName(form.firstName),
      lastName: validateName(form.lastName),
      email: validateGmail(form.email),
      phone: validatePhone(form.phone),
    };
    const hasErrors = Object.values(errors).some(Boolean);
    setFormErrors(Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg)));
    if (hasErrors) return;

    setCreateLoading(true);
    try {
      await CaretakerApi.create(form);
      setSuccessMsg(`Invitation sent to ${form.email}. They'll receive an activation email.`);
      setForm({ firstName: '', lastName: '', email: '', phone: '' });
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
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Caretakers</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Invite a caretaker" className="lg:col-span-1">
          <form onSubmit={onCreate} className="space-y-3">
            <ErrorBanner message={createError} />
            <SuccessBanner message={successMsg} />
            <Field label="First name" error={formErrors.firstName}>
              <TextInput value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} error={formErrors.firstName} required />
            </Field>
            <Field label="Last name" error={formErrors.lastName}>
              <TextInput value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} error={formErrors.lastName} required />
            </Field>
            <Field label="Email (Gmail only)" error={formErrors.email}>
              <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={formErrors.email} required />
            </Field>
            <Field label="Phone" error={formErrors.phone}>
              <TextInput
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: sanitizePhoneInput(e.target.value) })}
                error={formErrors.phone}
                required
              />
            </Field>
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
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{c.fullName}</p>
                    <p className="text-sm text-gray-500">{c.email}</p>
                    <p className="text-xs text-gray-400">{c.phone}</p>
                  </div>
                  <Badge tone={STATUS_TONE[c.accountStatus]}>{c.accountStatus.replace('_', ' ')}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
