import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout from './AuthLayout.jsx';
import AuthApi from '../../services/AuthApi.js';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await AuthApi.forgotPassword({ email });
      // Deliberately generic: never confirms or denies that the email exists.
      setMessage(res.message);
      setSubmitted(true);
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Forgot your password?" subtitle="Request a reset code by email when available, or use a recovery code you already have.">
      <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-gray-600" aria-label="Ways to reset your password">
        <li>a 6-digit code from your authenticator app, if two-factor sign-in is on;</li>
        <li>one of your backup codes; or</li>
        <li>a reset code from an administrator, who will confirm who you are first.</li>
      </ul>
      <form onSubmit={onSubmit} className="space-y-4">
        <ErrorBanner message={error} />
        <SuccessBanner message={message} />
        <Field required label="Email">
          <TextInput type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Button type="submit" className="w-full" loading={loading}>
          Continue
        </Button>
      </form>
      {submitted && (
        <p className="mt-4 text-center text-sm">
          <Link to="/reset-password" state={{ email }} className="font-medium text-brand-600 hover:underline">
            I have a code — reset my password
          </Link>
        </p>
      )}
    </AuthLayout>
  );
}
