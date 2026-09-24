import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export default function AccountRecoveryPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', newPassword: '' });
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
      const res = await AuthApi.recoverAccount(form);
      setSuccess(res.message);
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Recover an archived account" subtitle="Accounts archived after 30 days of inactivity can be reactivated here.">
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorBanner message={error} />
        <SuccessBanner message={success} />
        <Field label="Registered email">
          <TextInput type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </Field>
        <div>
          <Field label="New password">
            <PasswordInput value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
          </Field>
          <PasswordStrengthIndicator password={form.newPassword} />
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
          <PasswordMatchHint password={form.newPassword} confirmPassword={confirmPassword} />
          {confirmError && <p className="mt-2 text-xs text-red-600">{confirmError}</p>}
        </div>
        <Button type="submit" className="w-full" loading={loading}>
          Recover account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        <Link to="/login" className="hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
