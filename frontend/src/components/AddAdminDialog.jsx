import { useId, useState } from 'react';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import Button from './ui/Button.jsx';
import { Field, TextInput } from './ui/Field.jsx';
import GmailUsernameInput from './ui/GmailUsernameInput.jsx';
import CountryPhoneInput from './ui/CountryPhoneInput.jsx';
import AdminApi from '../services/AdminApi.js';
import { describeApiError } from '../utils/errors.js';
import { inviteNameInput, toNameCase } from '../utils/textFormat.js';
import { INVITE_FIRST_NAME_MAX, INVITE_LAST_NAME_MAX, validateGmail, validateInviteName } from '../utils/validators.js';
import { validateAdminPhone } from '../data/adminPhoneCountries.js';

const EMPTY = { firstName: '', lastName: '', email: '', phone: '' };
const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Main admin: add another admin. No password is chosen here; step 2 shows a one-time setup code
 * (30 minutes) that the new admin enters under "Forgot password?" to set their own password.
 * Name and email work like a caretaker invite; the phone may be from another listed country.
 */
export default function AddAdminDialog({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [result, setResult] = useState(null); // { user, code, expiresAt }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const phoneId = useId();

  // Editing a field clears its error, so a fixed value doesn't keep showing the old message.
  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const create = async () => {
    setError('');
    const payload = {
      firstName: toNameCase(form.firstName.trim()),
      lastName: toNameCase(form.lastName.trim()),
      email: `${form.email.trim().toLowerCase()}@gmail.com`,
      phone: form.phone,
    };
    // Show the names the way they will be saved (e.g. "o'connor" -> "O'Connor").
    setForm((f) => ({ ...f, firstName: payload.firstName, lastName: payload.lastName }));
    const errors = Object.fromEntries(Object.entries({
      firstName: validateInviteName(payload.firstName, INVITE_FIRST_NAME_MAX),
      lastName: validateInviteName(payload.lastName, INVITE_LAST_NAME_MAX),
      email: validateGmail(payload.email),
      phone: validateAdminPhone(payload.phone),
    }).filter(([, msg]) => msg));
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setBusy(true);
    try {
      const created = await AdminApi.createAdmin(payload);
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
          <Field label="First name" required error={fieldErrors.firstName}>
            <TextInput value={form.firstName} onChange={(e) => set('firstName', inviteNameInput(e.target.value))} maxLength={INVITE_FIRST_NAME_MAX} autoComplete="off" error={fieldErrors.firstName} />
          </Field>
          <Field label="Last name" required error={fieldErrors.lastName}>
            <TextInput value={form.lastName} onChange={(e) => set('lastName', inviteNameInput(e.target.value))} maxLength={INVITE_LAST_NAME_MAX} autoComplete="off" error={fieldErrors.lastName} />
          </Field>
          <Field label="Email (Gmail only)" required error={fieldErrors.email} className="sm:col-span-2">
            <GmailUsernameInput value={form.email} onChange={(value) => set('email', value)} autoComplete="off" error={fieldErrors.email} />
          </Field>
          <Field label="Phone" required error={fieldErrors.phone} htmlFor={phoneId} className="sm:col-span-2">
            <CountryPhoneInput id={phoneId} value={form.phone} onChange={(value) => set('phone', value)} autoComplete="off" error={fieldErrors.phone} />
          </Field>
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
