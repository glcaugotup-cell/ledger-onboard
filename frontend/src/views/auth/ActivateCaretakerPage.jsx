import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';
import AuthApi from '../../services/AuthApi.js';
import { Field } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import PasswordInput from '../../components/ui/PasswordInput.jsx';
import PasswordMatchHint from '../../components/ui/PasswordMatchHint.jsx';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator.jsx';
import { describeApiError } from '../../utils/errors.js';
import { validatePassword } from '../../utils/validators.js';

export default function ActivateCaretakerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
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
      // confirmPassword is a frontend-only typo guard (same pattern as
      // registration) — never sent to the backend, which still only
      // accepts { token, password }.
      const res = await AuthApi.activateCaretaker({ token, password });
      setSuccess(res.message);
      // Go to the landing page; `replace` keeps the single-use activation link out of history.
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout title="Invalid activation link">
        <ErrorBanner message="This activation link is missing its token. Ask your landlord to resend the invitation." />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Activate your caretaker account" subtitle="Set a password to finish activating your account.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />

        <div>
          <Field label="New password">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          <PasswordStrengthIndicator password={password} />
        </div>

        <div>
          <Field label="Confirm password">
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
