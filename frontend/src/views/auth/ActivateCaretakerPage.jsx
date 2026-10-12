import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';
import AuthApi from '../../services/AuthApi.js';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import PasswordInput from '../../components/ui/PasswordInput.jsx';
import PasswordMatchHint from '../../components/ui/PasswordMatchHint.jsx';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator.jsx';
import { describeApiError } from '../../utils/errors.js';
import { validatePassword } from '../../utils/validators.js';
import { cleanMfaCode } from '../../utils/mfa.js';

/** A caretaker activates their account with their email, the code from their landlord and a new password. */
export default function ActivateCaretakerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Older invitation emails linked here with ?token=…; those links no longer work.
  const fromOldLink = params.has('token');
  const [form, setForm] = useState({ email: '', code: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setConfirmError('');

    if (!form.email.trim() || !form.code) {
      setError('Enter your email and the activation code from your landlord.');
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(`${passwordError}.`);
      return;
    }
    if (!confirmPassword) {
      setConfirmError('Please confirm your password.');
      return;
    }
    if (confirmPassword !== password) {
      // Already shown live just below the field via PasswordMatchHint —
      // no separate message needed here, just block the submit.
      return;
    }

    setLoading(true);
    try {
      // confirmPassword is a frontend-only typo guard (same pattern as registration): never sent.
      const res = await AuthApi.activateCaretaker({ email: form.email.trim(), code: form.code, password });
      setSuccess(res.message);
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Activate your caretaker account"
      subtitle="Enter your email, the activation code your landlord gave you, and choose a new password."
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {fromOldLink && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="note">
            Activation links from invitation emails no longer work. Ask your landlord for an activation code.
          </p>
        )}
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />

        <Field required label="Email">
          <TextInput type="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" required />
        </Field>
        <Field required label="Activation code" hint="XXXXX-XXXXX, from your landlord">
          <TextInput
            value={form.code}
            onChange={(e) => setForm({ ...form, code: cleanMfaCode(e.target.value) })}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={11}
            required
          />
        </Field>

        <div>
          <Field required label="New password">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <PasswordStrengthIndicator password={password} />
        </div>

        <div>
          <Field required label="Confirm password">
            <PasswordInput
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmError('');
              }}
              required
            />
          </Field>
          <PasswordMatchHint password={password} confirmPassword={confirmPassword} />
          {confirmError && <p className="mt-2 text-xs text-red-600">{confirmError}</p>}
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          Activate account
        </Button>
      </form>
    </AuthLayout>
  );
}
