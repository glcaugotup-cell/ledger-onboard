import { useState } from 'react';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import Button from './ui/Button.jsx';
import { Field, TextInput } from './ui/Field.jsx';
import AdminApi from '../services/AdminApi.js';
import { describeApiError } from '../utils/errors.js';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '' };
const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Main admin: add another admin. No password is chosen here; step 2 shows a one-time setup code
 * (30 minutes) that the new admin enters under "Forgot password?" to set their own password.
 */
export default function AddAdminDialog({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null); // { user, code, expiresAt }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const create = async () => {
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const created = await AdminApi.createAdmin({ ...form, email: form.email.trim() });
      setResult(created);
      onCreated?.(created.user);
    } catch (err) {
      const described = describeApiError(err);
      setFieldErrors(described.fieldErrors);
      setError(described.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the code and copy it.');
    }
  };

  if (!result) {
    return (
      <ConfirmDialog
        open
        title="Add an admin"
        message="Admins can manage users, reviews and landlord verifications. Only add people you trust."
        confirmLabel="Add admin"
        loading={busy}
        confirmDisabled={!form.firstName.trim() || !form.lastName.trim() || !form.email.trim() || !form.phone.trim()}
        error={error}
        onConfirm={create}
        onCancel={onClose}
      >
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="First name" required error={fieldErrors.firstName}><TextInput value={form.firstName} onChange={set('firstName')} maxLength={15} autoComplete="off" /></Field>
          <Field label="Last name" required error={fieldErrors.lastName}><TextInput value={form.lastName} onChange={set('lastName')} maxLength={20} autoComplete="off" /></Field>
          <Field label="Email" required error={fieldErrors.email}><TextInput type="email" value={form.email} onChange={set('email')} maxLength={254} autoComplete="off" /></Field>
          <Field label="Phone" required error={fieldErrors.phone}><TextInput type="tel" value={form.phone} onChange={set('phone')} maxLength={16} placeholder="09XXXXXXXXX" autoComplete="off" /></Field>
        </div>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      open
      title={`${result.user.fullName} is now an admin`}
      message="Give them this setup code in person. It is shown only once."
      confirmLabel="Done"
      cancelLabel="Close"
      error={error}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <div className="mt-3 space-y-3">
        <p className="rounded-lg border border-gray-200 bg-gray-50 py-3 text-center font-mono text-2xl font-bold tracking-[0.2em] text-gray-900" data-testid="setup-code">
          {result.code}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">Expires at {formatTime(result.expiresAt)}.</p>
          <Button type="button" variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</Button>
        </div>
        <p className="text-xs text-gray-500">
          They go to the sign-in page, choose “Forgot password?”, and enter their email, this code and a new password. If the code expires, use “Reset code” on their account for a new one.
        </p>
      </div>
    </ConfirmDialog>
  );
}
