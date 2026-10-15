import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';
import AuthApi from '../../services/AuthApi.js';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';

/**
 * Step 1 of a reset: email a one-time recovery code, then continue on the reset page with the
 * email filled in. Authenticator, backup and administrator codes still work there as fallbacks.
 */
export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await AuthApi.forgotPassword({ email: email.trim() });
      // Deliberately generic: never confirms or denies that the email exists.
      navigate('/reset-password', { state: { email: email.trim(), notice: res.message } });
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your Ledger OnBoard email and we'll send you a one-time recovery code.">
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorBanner message={error} />
        <Field required label="Email address">
          <TextInput type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          Send recovery code
        </Button>
      </form>
      <p className="mt-5 text-center text-xs leading-relaxed text-gray-500">
        Didn&apos;t get the email? You can also reset with a code from your authenticator app, one of your backup codes, or a reset code from an
        administrator.{' '}
        <Link to="/reset-password" state={{ email: email.trim() }} className="font-medium text-brand-600 hover:underline">
          I already have a code
        </Link>
      </p>
    </AuthLayout>
  );
}
