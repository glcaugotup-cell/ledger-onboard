import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';
import AuthApi from '../../services/AuthApi.js';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorBanner, InfoBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import PasswordInput from '../../components/ui/PasswordInput.jsx';
import PasswordMatchHint from '../../components/ui/PasswordMatchHint.jsx';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator.jsx';
import { describeApiError } from '../../utils/errors.js';
import { validatePassword } from '../../utils/validators.js';
import { cleanMfaCode } from '../../utils/mfa.js';

export default function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: location.state?.email || '', code: '', newPassword: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setConfirmError('');

    const passwordError = validatePassword(form.newPassword);
    if (passwordError) {
      setError(`${passwordError}.`);
      return;
    }
    if (!confirmPassword) {
      setConfirmError('Please confirm your password.');
      return;
    }
    // Mismatch is already shown live under the field by PasswordMatchHint.
    if (confirmPassword !== form.newPassword) return;

    setLoading(true);
    try {
      // confirmPassword is a frontend-only typo guard — never sent to the backend.
      const res = await AuthApi.resetPassword(form);
      setSuccess(res.message);
      setTimeout(() => navigate('/'), 1200);
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Enter the recovery code we emailed you, then choose a new password."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {!success && <InfoBanner message={location.state?.notice ? `${location.state.notice} Check your inbox and spam folder.` : ''} />}
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
        <Field required label="Email">
          <TextInput type="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <Field required label="Recovery code" hint="The 6-digit code from your email. A code from your authenticator app, a backup code (XXXXX-XXXXX) or an administrator's reset code (XXXX-XXXX) also works.">
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
            <PasswordInput value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
          </Field>
          <PasswordStrengthIndicator password={form.newPassword} />
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
          <PasswordMatchHint password={form.newPassword} confirmPassword={confirmPassword} />
          {confirmError && <p className="mt-2 text-xs text-red-600">{confirmError}</p>}
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  );
}
