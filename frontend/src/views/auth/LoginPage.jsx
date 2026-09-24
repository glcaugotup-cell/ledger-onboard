import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthApi from '../../services/AuthApi.js';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { useAuthedRedirect } from '../../routes/useAuthedRedirect.js';
import { validateLoginEmail, validateLoginPassword } from '../../utils/validators.js';

const FIELD_VALIDATORS = { email: validateLoginEmail, password: validateLoginPassword };

export default function LoginPage() {
  const { login, verifyLoginOtp, mfaChallenge } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Set on EMAIL_NOT_VERIFIED so the user can resend and enter a code inline.
  // Set on EMAIL_NOT_REGISTERED to offer a direct link to registration.
  const [emailNotRegistered, setEmailNotRegistered] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  useAuthedRedirect();

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (touched[key]) setErrors((prev) => ({ ...prev, [key]: FIELD_VALIDATORS[key](value) || undefined }));
  }

  function onFieldBlur(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: FIELD_VALIDATORS[key](form[key]) || undefined }));
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setEmailNotRegistered(false);
    setVerified(false);

    const nextErrors = { email: FIELD_VALIDATORS.email(form.email), password: FIELD_VALIDATORS.password(form.password) };
    setErrors(nextErrors);
    setTouched({ email: true, password: true });
    // Client-side check only; the backend's loginValidators remain the real gate.
    if (Object.values(nextErrors).some(Boolean)) return;

    setLoading(true);
    try {
      // No navigate() here: useAuthedRedirect() redirects once the user is authenticated.
      await login(form);
    } catch (err) {
      const { message, code } = describeApiError(err);
      setError(message);
      setNeedsVerification(code === 'EMAIL_NOT_VERIFIED');
      setEmailNotRegistered(code === 'EMAIL_NOT_REGISTERED');
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyLoginOtp(otp);
      navigate('/', { replace: true });
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const onResendVerification = async () => {
    setResendMessage('');
    setVerifyError('');
    setResending(true);
    try {
      await AuthApi.resendOtp({ email: form.email });
      setResendMessage('A new verification code has been sent to your email.');
    } catch (err) {
      setVerifyError(describeApiError(err).message);
    } finally {
      setResending(false);
    }
  };

  const onVerifyEmail = async () => {
    setVerifyError('');
    setVerifying(true);
    try {
      await AuthApi.verifyRegistrationOtp({ email: form.email, code: verifyCode });
      setNeedsVerification(false);
      setVerified(true);
      setError('');
    } catch (err) {
      setVerifyError(describeApiError(err).message);
    } finally {
      setVerifying(false);
    }
  };

  if (mfaChallenge) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Enter verification code</h1>
        <p className="mt-1 text-sm text-gray-500">We sent a 6-digit code to {mfaChallenge.email}</p>

        <form onSubmit={onVerifyOtp} className="mt-6 space-y-4">
          <ErrorBanner message={error} />
          <Field label="Verification code">
            <TextInput
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              required
            />
          </Field>
          <Button type="submit" variant="accent" className="w-full" loading={loading}>
            Verify &amp; sign in
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Login</h1>
      <p className="mt-1 text-sm text-gray-500">Welcome back! Please enter your details.</p>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
        <ErrorBanner message={error} />
        {emailNotRegistered && (
          <p className="-mt-2 text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-semibold text-brand-700 hover:underline">
              Register now
            </Link>
          </p>
        )}
        {verified && <SuccessBanner message="Email verified! You can now log in." />}
        <Field label="Email" error={touched.email ? errors.email : undefined}>
          <TextInput
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            onBlur={() => onFieldBlur('email')}
            placeholder="you@gmail.com"
            error={touched.email ? errors.email : undefined}
          />
        </Field>
        <Field label="Password" error={touched.password ? errors.password : undefined}>
          <TextInput
            type="password"
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
            onBlur={() => onFieldBlur('password')}
            error={touched.password ? errors.password : undefined}
          />
        </Field>
        <div className="flex justify-end text-sm">
          <Link to="/forgot-password" className="text-brand-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" variant="accent" className="w-full" loading={loading}>
          Login
        </Button>

        {needsVerification && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs text-amber-700">Your email address hasn&apos;t been verified yet.</p>
            {resendMessage && <p className="text-xs text-green-700">{resendMessage}</p>}
            {verifyError && <p className="text-xs text-red-600">{verifyError}</p>}
            <div className="flex gap-2">
              <TextInput
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                inputMode="numeric"
                maxLength={6}
                className="flex-1"
              />
              <Button type="button" variant="secondary" loading={verifying} onClick={onVerifyEmail}>
                Verify
              </Button>
            </div>
            <button
              type="button"
              onClick={onResendVerification}
              disabled={resending}
              className="text-xs font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {resending ? 'Resending…' : 'Resend verification email'}
            </button>
          </div>
        )}
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link to="/register" className="font-semibold text-brand-700 hover:underline">
          Register
        </Link>
      </p>
      <p className="mt-2 text-center text-xs text-gray-400">
        <Link to="/account-recovery" className="hover:underline">
          Recover an archived account
        </Link>
      </p>
    </div>
  );
}
