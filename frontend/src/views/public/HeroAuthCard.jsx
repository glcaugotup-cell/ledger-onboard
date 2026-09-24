import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  EyeIcon,
  EyeSlashIcon,
  EnvelopeIcon,
  LockClosedIcon,
  UserIcon,
  PhoneIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  MapPinIcon,
  BuildingOffice2Icon,
  ArrowRightIcon,
  ArrowLeftOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthApi from '../../services/AuthApi.js';
import { ROLE_HOME } from '../../routes/roleHome.js';
import Button from '../../components/ui/Button.jsx';
import PasswordMatchHint from '../../components/ui/PasswordMatchHint.jsx';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator.jsx';
import PrivacyPolicyModal from '../../components/PrivacyPolicyModal.jsx';
import { describeApiError } from '../../utils/errors.js';
import {
  normalizePhToE164,
  sanitizePhoneInput,
  validateGmail,
  validateLoginEmail,
  validateLoginPassword,
  validateName,
  validatePassword,
  validatePhone,
} from '../../utils/validators.js';
import { toNameCase } from '../../utils/textFormat.js';
import logo from '../../assets/logo.webp';
import houseWelcome from '../../assets/housedesign1.webp';
import houseExplore from '../../assets/housedesign2.webp';

/**
 * Login/register widget embedded in the landing page Hero. It is always
 * controlled: switching forms calls `onModeChange` (never `navigate()`), so
 * the panel slides in place. The standalone /login and /register routes are a
 * separate implementation (AuthSplitLayout + LoginPage/RegisterPage).
 */

const inputClass =
  'w-full rounded-xl border border-gray-200 bg-gray-50/60 py-3 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 transition-all focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';
const errorInputClass = '!border-red-400 focus:!ring-red-400';

function BrandLockup({ size = 44 }) {
  return <img src={logo} alt="Ledger OnBoard" style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover shadow-sm" />;
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

const LOGIN_FIELD_VALIDATORS = { email: validateLoginEmail, password: validateLoginPassword };

function HeroLoginForm({ onSwitch }) {
  const { login, verifyLoginOtp, mfaChallenge } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Set on EMAIL_NOT_VERIFIED so the user can resend and enter a code inline.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  // Set on EMAIL_NOT_REGISTERED to offer a direct link to the register panel.
  const [emailNotRegistered, setEmailNotRegistered] = useState(false);

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    // Re-validate live only after the field was touched, so errors don't flash on the first keystroke.
    if (touched[key]) setErrors((prev) => ({ ...prev, [key]: LOGIN_FIELD_VALIDATORS[key](value) || undefined }));
  }

  function onFieldBlur(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
    setErrors((prev) => ({ ...prev, [key]: LOGIN_FIELD_VALIDATORS[key](form[key]) || undefined }));
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setEmailNotRegistered(false);
    setVerified(false);

    const nextErrors = { email: LOGIN_FIELD_VALIDATORS.email(form.email), password: LOGIN_FIELD_VALIDATORS.password(form.password) };
    setErrors(nextErrors);
    setTouched({ email: true, password: true });
    // Client-side check only; the backend's loginValidators remain the real gate.
    if (Object.values(nextErrors).some(Boolean)) return;

    setLoading(true);
    try {
      const result = await login(form);
      if (!result.mfaRequired) {
        navigate(ROLE_HOME[result.user?.role] || '/', { replace: true });
      }
    } catch (err) {
      const { message, code } = describeApiError(err);
      setError(message);
      setNeedsVerification(code === 'EMAIL_NOT_VERIFIED');
      setEmailNotRegistered(code === 'EMAIL_NOT_REGISTERED');
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

  const onVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await verifyLoginOtp(otp);
      navigate(ROLE_HOME[user?.role] || '/', { replace: true });
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  if (mfaChallenge) {
    return (
      <div className="flex min-h-full flex-col justify-between p-6 pt-20 lg:p-10 lg:pt-24">
        <div className="flex justify-end">
          <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold tracking-widest text-emerald-800">
            <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" /> SAFE &middot; TRUSTED
          </span>
        </div>
        <div className="mx-auto my-auto w-full max-w-sm">
          <div className="mb-3 flex justify-center">
            <BrandLockup size={48} />
          </div>
          <h2 className="mb-0.5 text-center text-2xl font-extrabold text-gray-900">Enter verification code</h2>
          <p className="mb-6 text-center text-xs text-gray-500">We sent a 6-digit code to {mfaChallenge.email}</p>
          <form onSubmit={onVerifyOtp} className="space-y-3.5">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-gray-900 focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {error && <p className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-600">{error}</p>}
            <Button type="submit" variant="accent" className="w-full justify-center rounded-xl py-2.5 text-xs" disabled={loading}>
              {loading ? 'Verifying…' : 'Verify & sign in'}
            </Button>
          </form>
        </div>
        <div className="text-center text-[10px] text-gray-400">&copy; {new Date().getFullYear()} Ledger OnBoard</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col justify-between p-6 pt-20 lg:p-10 lg:pt-24">
      <div className="flex justify-end">
        <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-extrabold tracking-widest text-emerald-800">
          <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" /> SAFE &middot; TRUSTED
        </span>
      </div>

      <div className="mx-auto my-auto w-full max-w-sm">
        <div className="mb-3 flex justify-center">
          <BrandLockup size={48} />
        </div>
        <h2 className="mb-0.5 text-center text-2xl font-extrabold text-gray-900">Login</h2>
        <p className="mb-6 text-center text-xs text-gray-500">Welcome back! Please enter your details.</p>

        <form onSubmit={onSubmit} noValidate className="space-y-3.5">
          <div>
            <div className="relative">
              <EnvelopeIcon className="absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                onBlur={() => onFieldBlur('email')}
                className={`${inputClass} ${touched.email && errors.email ? errorInputClass : ''}`}
              />
            </div>
            <FieldError message={touched.email ? errors.email : ''} />
          </div>

          <div>
            <div className="relative">
              <LockClosedIcon className="absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                onBlur={() => onFieldBlur('password')}
                className={`${inputClass} pr-10 ${touched.password && errors.password ? errorInputClass : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
              </button>
            </div>
            <FieldError message={touched.password ? errors.password : ''} />
          </div>

          <div className="-mt-1 text-right">
            <Link to="/forgot-password" className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 hover:underline">
              Forgot password?
            </Link>
          </div>

          {error && <p className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-600">{error}</p>}
          {emailNotRegistered && (
            <p className="text-xs text-gray-600">
              Don&apos;t have an account?{' '}
              <button type="button" onClick={onSwitch} className="font-bold text-brand-700 hover:underline">
                Register now
              </button>
            </p>
          )}
          {verified && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700">Email verified! You can now log in.</p>}

          <Button type="submit" variant="accent" className="w-full justify-center gap-2 rounded-xl py-2.5 text-xs" disabled={loading}>
            {loading ? 'Logging in…' : (
              <>
                Login <ArrowRightIcon className="h-3.5 w-3.5" />
              </>
            )}
          </Button>

          {needsVerification && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-xs text-amber-700">Your email address hasn&apos;t been verified yet.</p>
              {resendMessage && <p className="text-xs text-emerald-700">{resendMessage}</p>}
              {verifyError && <p className="text-xs text-red-600">{verifyError}</p>}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  className={`${inputClass} flex-1 !pl-4 text-center font-mono tracking-[0.3em]`}
                />
                <Button type="button" variant="secondary" className="rounded-xl text-xs" disabled={verifying} onClick={onVerifyEmail}>
                  {verifying ? 'Verifying…' : 'Verify'}
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

          <div className="mt-4 text-center lg:hidden">
            <p className="text-xs text-gray-600">
              Don&apos;t have an account?{' '}
              <button type="button" onClick={onSwitch} className="font-bold text-brand-700 hover:underline">
                Register
              </button>
            </p>
          </div>
        </form>
      </div>

      <div className="text-center text-[10px] text-gray-400">&copy; {new Date().getFullYear()} Ledger OnBoard</div>
    </div>
  );
}

const initialRegisterForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  role: 'tenant',
  emergencyContactName: '',
  emergencyContactPhone: '',
  privacyConsent: false,
};

const FIELD_VALIDATORS = {
  firstName: validateName,
  lastName: validateName,
  email: validateGmail,
  phone: validatePhone,
  password: validatePassword,
};

const EMERGENCY_CONTACT_VALIDATORS = {
  emergencyContactName: validateName,
  emergencyContactPhone: validatePhone,
};

// Applied on blur and again before submit; mirrors RegisterPage.jsx and the backend sanitizers.
const NORMALIZERS = {
  firstName: toNameCase,
  lastName: toNameCase,
  emergencyContactName: toNameCase,
  phone: normalizePhToE164,
  emergencyContactPhone: normalizePhToE164,
};

const REGISTER_RESEND_COOLDOWN_SECONDS = 45;

function HeroRegisterForm({ onSwitch, onRegistered }) {
  const { register } = useAuth();
  const [form, setForm] = useState(initialRegisterForm);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [loading, setLoading] = useState(false);

  // 'form' -> 'verify' (OTP emailed) -> 'done'
  const [step, setStep] = useState('form');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState('');
  const [verifyInfo, setVerifyInfo] = useState('');
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    const validate = FIELD_VALIDATORS[key] || EMERGENCY_CONTACT_VALIDATORS[key];
    if (validate && errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: validate(value) || undefined }));
    }
  }

  function onBlur(key) {
    setTouched((prev) => ({ ...prev, [key]: true }));
    const normalize = NORMALIZERS[key];
    const normalizedValue = normalize ? normalize(form[key]) : form[key];
    if (normalizedValue !== form[key]) {
      setForm((prev) => ({ ...prev, [key]: normalizedValue }));
    }
    const validate = FIELD_VALIDATORS[key] || EMERGENCY_CONTACT_VALIDATORS[key];
    if (validate) setErrors((prev) => ({ ...prev, [key]: validate(normalizedValue) || undefined }));
  }

  function updateConfirmPassword(value) {
    setForm((prev) => ({ ...prev, confirmPassword: value }));
    if (errors.confirmPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: value === form.password ? undefined : 'Passwords do not match' }));
    }
  }

  function onBlurConfirmPassword() {
    setTouched((prev) => ({ ...prev, confirmPassword: true }));
    setErrors((prev) => ({ ...prev, confirmPassword: form.confirmPassword === form.password ? undefined : 'Passwords do not match' }));
  }

  function toggleConsent(checked) {
    setForm((prev) => ({ ...prev, privacyConsent: checked }));
    if (checked) setErrors((prev) => ({ ...prev, privacyConsent: undefined }));
  }

  function validateAll(values = form) {
    const nextErrors = {};
    for (const key of Object.keys(FIELD_VALIDATORS)) {
      const err = FIELD_VALIDATORS[key](values[key]);
      if (err) nextErrors[key] = err;
    }
    if (values.confirmPassword !== values.password) nextErrors.confirmPassword = 'Passwords do not match';
    if (values.role === 'tenant') {
      for (const key of Object.keys(EMERGENCY_CONTACT_VALIDATORS)) {
        const err = EMERGENCY_CONTACT_VALIDATORS[key](values[key]);
        if (err) nextErrors[key] = err;
      }
    }
    if (!values.privacyConsent) nextErrors.privacyConsent = 'You must agree to the Privacy Policy to continue';
    return nextErrors;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    setCancelMessage('');

    // Normalize before validating so we validate exactly what will be submitted.
    const normalizedForm = { ...form };
    for (const key of Object.keys(NORMALIZERS)) {
      normalizedForm[key] = NORMALIZERS[key](form[key]);
    }
    setForm(normalizedForm);

    const nextErrors = validateAll(normalizedForm);
    setErrors(nextErrors);
    setTouched((prev) => ({
      ...prev,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
      privacyConsent: true,
      ...(normalizedForm.role === 'tenant' ? { emergencyContactName: true, emergencyContactPhone: true } : {}),
    }));
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const { firstName, lastName, email, phone, password, role, privacyConsent, emergencyContactName, emergencyContactPhone } = normalizedForm;
      const payload = { firstName, lastName, email, phone, password, role, privacyConsent };
      if (role === 'tenant') payload.emergencyContact = { name: emergencyContactName, phone: emergencyContactPhone };
      await register(payload);
      // register() already sent the first OTP, so start the resend cooldown now.
      setRegisteredEmail(email);
      setCooldown(REGISTER_RESEND_COOLDOWN_SECONDS);
      setVerifyInfo('');
      setStep('verify');
    } catch (err) {
      const { message, code, fieldErrors } = describeApiError(err);
      if (code === 'ACCOUNT_PENDING_VERIFICATION') {
        // Pending unverified registration: the backend re-sent a code, so resume verification.
        setRegisteredEmail(email);
        setCooldown(REGISTER_RESEND_COOLDOWN_SECONDS);
        setVerifyInfo(message);
        setStep('verify');
        return;
      }
      setSubmitError(message);
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyOtp(e) {
    e.preventDefault();
    setOtpError('');
    setVerifying(true);
    try {
      await AuthApi.verifyRegistrationOtp({ email: registeredEmail, code: otp });
      setStep('done');
    } catch (err) {
      setOtpError(describeApiError(err).message);
    } finally {
      setVerifying(false);
    }
  }

  async function onResendOtp() {
    setOtpError('');
    setResending(true);
    try {
      await AuthApi.resendOtp({ email: registeredEmail });
      setCooldown(REGISTER_RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const { message, details } = describeApiError(err);
      setOtpError(message);
      if (details?.retryAfterSeconds) setCooldown(details.retryAfterSeconds);
    } finally {
      setResending(false);
    }
  }

  async function onCancelVerification() {
    setCancelling(true);
    try {
      await AuthApi.cancelRegistration({ email: registeredEmail });
    } catch {
      // Best-effort: return to the form even if the cancel call fails.
    } finally {
      setCancelling(false);
      setOtp('');
      setOtpError('');
      setStep('form');
      setCancelMessage('Registration cancelled. You can register again with the correct information.');
    }
  }

  const smallInput = 'w-full rounded-xl border border-gray-200 bg-gray-50/60 py-2.5 pl-9 pr-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-all focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500';

  if (step === 'verify') {
    return (
      <div className="flex min-h-full flex-col justify-between p-6 pt-20 lg:p-8 lg:pt-24">
        <div className="mb-1 flex items-center justify-end">
          <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold tracking-widest text-emerald-800">
            <CheckCircleIcon className="h-3 w-3 text-emerald-600" /> SAFE &middot; TRUSTED
          </span>
        </div>
        <div className="mx-auto my-auto w-full max-w-sm">
          <div className="mb-3 flex justify-center">
            <BrandLockup size={48} />
          </div>
          <h2 className="mb-0.5 text-center text-2xl font-extrabold text-gray-900">Verify Your Email</h2>
          <p className="mb-3 text-center text-xs text-gray-500">
            We sent a 6-digit code to <span className="font-medium text-gray-700">{registeredEmail}</span>
          </p>
          {verifyInfo && (
            <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-center text-xs font-medium text-emerald-700">{verifyInfo}</p>
          )}
          <form onSubmit={onVerifyOtp} noValidate className="space-y-3.5">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="w-full rounded-xl border border-gray-200 bg-gray-50/60 px-4 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-gray-900 focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {otpError && <p className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-medium text-red-600">{otpError}</p>}
            <Button type="submit" variant="accent" className="w-full justify-center rounded-xl py-2.5 text-xs" disabled={verifying}>
              {verifying ? 'Verifying…' : 'Verify Email'}
            </Button>
            <button
              type="button"
              onClick={onResendOtp}
              disabled={cooldown > 0 || resending}
              className="w-full text-center text-xs font-semibold text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
            >
              {resending ? 'Resending…' : cooldown > 0 ? `Resend OTP in ${cooldown} seconds` : 'Resend OTP'}
            </button>
            <Button
              type="button"
              variant="secondary"
              className="w-full justify-center rounded-xl py-2.5 text-xs !text-red-600 !border-red-200 hover:!bg-red-50"
              disabled={cancelling}
              onClick={onCancelVerification}
            >
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </Button>
            <p className="text-center text-[10px] text-gray-400">Entered the wrong email or details? Cancel to go back and register again.</p>
          </form>
        </div>
        <div className="text-center text-[10px] text-gray-400">&copy; {new Date().getFullYear()} Ledger OnBoard</div>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="flex min-h-full flex-col justify-between p-6 pt-20 lg:p-8 lg:pt-24">
        <div className="mb-1 flex items-center justify-end">
          <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold tracking-widest text-emerald-800">
            <CheckCircleIcon className="h-3 w-3 text-emerald-600" /> SAFE &middot; TRUSTED
          </span>
        </div>
        <div className="mx-auto my-auto w-full max-w-sm text-center">
          <div className="mb-3 flex justify-center">
            <BrandLockup size={48} />
          </div>
          <h2 className="mb-2 text-2xl font-extrabold text-gray-900">Registration successful!</h2>
          <p className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
            Your email has been verified successfully. You can now log in to your account.
          </p>
          <Button type="button" variant="accent" className="w-full justify-center rounded-xl py-2.5 text-xs" onClick={() => onRegistered?.()}>
            Go to Login
          </Button>
        </div>
        <div className="text-center text-[10px] text-gray-400">&copy; {new Date().getFullYear()} Ledger OnBoard</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col justify-between p-6 pt-20 lg:p-8 lg:pt-24">
      <div className="mb-1 flex items-center justify-end">
        <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-extrabold tracking-widest text-emerald-800">
          <CheckCircleIcon className="h-3 w-3 text-emerald-600" /> SAFE &middot; TRUSTED
        </span>
      </div>

      <div className="mx-auto w-full max-w-sm py-1">
        <h2 className="mb-0.5 text-xl font-extrabold text-gray-900">Create Account</h2>
        <p className="mb-3 text-[11px] text-gray-500">Join Ledger OnBoard to start your journey.</p>
        {cancelMessage && (
          <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-emerald-700">{cancelMessage}</p>
        )}

        <form onSubmit={onSubmit} noValidate className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="relative">
                <UserIcon className="absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="First name"
                  value={form.firstName}
                  onChange={(e) => updateField('firstName', e.target.value)}
                  onBlur={() => onBlur('firstName')}
                  className={`${smallInput} ${touched.firstName && errors.firstName ? errorInputClass : ''}`}
                />
              </div>
              <FieldError message={touched.firstName ? errors.firstName : ''} />
            </div>
            <div>
              <div className="relative">
                <UserIcon className="absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Last name"
                  value={form.lastName}
                  onChange={(e) => updateField('lastName', e.target.value)}
                  onBlur={() => onBlur('lastName')}
                  className={`${smallInput} ${touched.lastName && errors.lastName ? errorInputClass : ''}`}
                />
              </div>
              <FieldError message={touched.lastName ? errors.lastName : ''} />
            </div>
          </div>

          <div>
            <div className="relative">
              <EnvelopeIcon className="absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                placeholder="yourname@gmail.com"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                onBlur={() => onBlur('email')}
                className={`${smallInput} ${touched.email && errors.email ? errorInputClass : ''}`}
              />
            </div>
            <FieldError message={touched.email ? errors.email : ''} />
          </div>

          <div>
            <div className="relative">
              <PhoneIcon className="absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={13}
                placeholder="+639171234567"
                value={form.phone}
                onChange={(e) => updateField('phone', sanitizePhoneInput(e.target.value))}
                onBlur={() => onBlur('phone')}
                className={`${smallInput} ${touched.phone && errors.phone ? errorInputClass : ''}`}
              />
            </div>
            <FieldError message={touched.phone ? errors.phone : ''} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <div className="relative">
                <LockClosedIcon className="absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={form.password}
                  onChange={(e) => updateField('password', e.target.value)}
                  onBlur={() => onBlur('password')}
                  className={`${smallInput} pr-7 ${touched.password && errors.password ? errorInputClass : ''}`}
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeSlashIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                </button>
              </div>
              <PasswordStrengthIndicator password={form.password} />
              <FieldError message={touched.password ? errors.password : ''} />
            </div>
            <div>
              <div className="relative">
                <LockClosedIcon className="absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  value={form.confirmPassword}
                  onChange={(e) => updateConfirmPassword(e.target.value)}
                  onBlur={onBlurConfirmPassword}
                  className={`${smallInput} pr-7 ${touched.confirmPassword && errors.confirmPassword ? errorInputClass : ''}`}
                />
                <button type="button" onClick={() => setShowConfirmPassword((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}>
                  {showConfirmPassword ? <EyeSlashIcon className="h-3.5 w-3.5" /> : <EyeIcon className="h-3.5 w-3.5" />}
                </button>
              </div>
              {/* A mismatch is shown live by PasswordMatchHint; FieldError only covers an empty confirm. */}
              <PasswordMatchHint password={form.password} confirmPassword={form.confirmPassword} />
              <FieldError message={touched.confirmPassword && !form.confirmPassword ? errors.confirmPassword : ''} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full cursor-pointer rounded-xl border border-gray-200 bg-gray-50/60 px-2.5 py-2.5 text-sm text-gray-900 focus:border-transparent focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="tenant">Renter / Tenant</option>
              <option value="landlord">Landlord</option>
            </select>
            <div className="flex items-center px-1 text-[10px] text-gray-400">Choose your role</div>
          </div>

          {form.role === 'tenant' && (
            <div className="grid grid-cols-1 gap-2.5 rounded-xl border border-amber-100 bg-amber-50/40 p-2.5 sm:grid-cols-2">
              <div className="sm:col-span-2 -mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-700">Emergency contact</div>
              <div>
                <input
                  type="text"
                  placeholder="Contact person"
                  value={form.emergencyContactName}
                  onChange={(e) => updateField('emergencyContactName', e.target.value)}
                  onBlur={() => onBlur('emergencyContactName')}
                  className={`w-full rounded-xl border border-gray-200 bg-white px-2.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 ${touched.emergencyContactName && errors.emergencyContactName ? errorInputClass : ''}`}
                />
                <FieldError message={touched.emergencyContactName ? errors.emergencyContactName : ''} />
              </div>
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="CP number"
                  value={form.emergencyContactPhone}
                  onChange={(e) => updateField('emergencyContactPhone', sanitizePhoneInput(e.target.value))}
                  onBlur={() => onBlur('emergencyContactPhone')}
                  className={`w-full rounded-xl border border-gray-200 bg-white px-2.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 ${touched.emergencyContactPhone && errors.emergencyContactPhone ? errorInputClass : ''}`}
                />
                <FieldError message={touched.emergencyContactPhone ? errors.emergencyContactPhone : ''} />
              </div>
            </div>
          )}

          <div>
            <label className="flex items-start gap-2 text-[11px] text-gray-600">
              <input
                type="checkbox"
                checked={form.privacyConsent}
                onChange={(e) => toggleConsent(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
              />
              <span>
                I agree to the{' '}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPrivacyModalOpen(true);
                  }}
                  className="cursor-pointer font-semibold text-gray-800 underline decoration-dotted underline-offset-2 hover:text-brand-700"
                >
                  Privacy Policy
                </button>{' '}
                — my information is used only to run this platform and won&apos;t be shared beyond that.
              </span>
            </label>
            <FieldError message={touched.privacyConsent ? errors.privacyConsent : ''} />
            <PrivacyPolicyModal open={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />
          </div>

          {submitError && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-600">{submitError}</p>}

          <Button type="submit" variant="accent" className="mt-1 w-full justify-center gap-2 rounded-xl py-2.5 text-xs" disabled={loading}>
            {loading ? 'Creating account…' : (
              <>
                Register <ArrowRightIcon className="h-3.5 w-3.5" />
              </>
            )}
          </Button>

          <div className="mt-3 text-center lg:hidden">
            <p className="text-xs text-gray-600">
              Already have an account?{' '}
              <button type="button" onClick={onSwitch} className="font-bold text-brand-700 hover:underline">
                Login here
              </button>
            </p>
          </div>
        </form>
      </div>

      <div className="flex items-center justify-center gap-1 text-center text-[10px] text-gray-500">
        <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" /> Your information is safe with us.
      </div>
    </div>
  );
}

export default function HeroAuthCard({ mode, onModeChange }) {
  const isLogin = mode !== 'register';
  const switchTo = (nextMode) => onModeChange?.(nextMode);
  const scrollToAbout = () => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const houseSize = 'max-w-[380px] lg:max-w-[460px]';
  // Shared by the form panels, overlay and overlay text so they move in sync.
  const transitionSpec = 'duration-[450ms] ease-in-out';

  return (
    // Both form panels are normal grid items so the section grows with the
    // taller form (min-h-screen, not h-screen); only the sliding overlay is absolute.
    <div className="relative min-h-screen w-full">
      <div className="relative min-h-screen w-full overflow-visible bg-white lg:grid lg:grid-cols-2">
        {/* REGISTER FORM PANEL */}
        <div
          className={`${!isLogin ? 'block' : 'hidden'} w-full lg:block lg:transition-all lg:duration-[450ms] lg:ease-in-out ${
            !isLogin ? 'lg:translate-x-0 lg:opacity-100' : 'lg:pointer-events-none lg:-translate-x-4 lg:opacity-0'
          }`}
        >
          <HeroRegisterForm onSwitch={() => switchTo('login')} onRegistered={() => switchTo('login')} />
        </div>

        {/* LOGIN FORM PANEL */}
        <div
          className={`${isLogin ? 'block' : 'hidden'} w-full lg:block lg:transition-all lg:duration-[450ms] lg:ease-in-out ${
            isLogin ? 'lg:translate-x-0 lg:opacity-100' : 'lg:pointer-events-none lg:translate-x-4 lg:opacity-0'
          }`}
        >
          <HeroLoginForm onSwitch={() => switchTo('register')} />
        </div>

        {/* GREEN OVERLAY PANEL — slides across on top, desktop only; its curved edge faces the form side. */}
        <div
          className={`absolute inset-y-0 left-0 z-20 hidden w-1/2 flex-col justify-between bg-gradient-to-br from-brand-800 via-brand-800 to-brand-900 p-8 pt-24 text-white transition-transform ${transitionSpec} lg:flex lg:p-10 lg:pt-24 ${
            // Fixed px radius: a % radius would clip the badge and footer near the edges.
            isLogin ? 'lg:rounded-r-[120px] xl:rounded-r-[140px]' : 'lg:rounded-l-[120px] xl:rounded-l-[140px]'
          }`}
          style={{ transform: isLogin ? 'translateX(0%)' : 'translateX(100%)' }}
        >
          {/* Anchored to the side away from the curve so the badge never sits under it. */}
          <div className={`flex shrink-0 items-center ${isLogin ? 'justify-start' : 'justify-end'}`}>
            <span className="flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-extrabold tracking-widest text-emerald-200 backdrop-blur-sm">
              <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-300" /> SAFE &middot; TRUSTED
            </span>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col justify-center py-4">
            {/* LOGIN OVERLAY CONTENT */}
            <div
              className={`flex flex-col transition-all duration-[450ms] ease-in-out ${
                isLogin ? 'pointer-events-auto translate-x-0 opacity-100' : 'pointer-events-none absolute inset-0 -translate-x-8 opacity-0'
              }`}
            >
              <h2 className="mb-3 text-3xl font-extrabold leading-tight text-white lg:text-4xl">
                Find your next apartment or move into your <span className="text-amber-400">dream boarding house</span>
              </h2>
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-brand-100">
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 backdrop-blur-md">
                  <BuildingOffice2Icon className="h-3.5 w-3.5 text-amber-400" /> Verified Listings
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 backdrop-blur-md">
                  <ShieldCheckIcon className="h-3.5 w-3.5 text-amber-400" /> Safe &amp; Secure
                </span>
                <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 backdrop-blur-md">
                  <MapPinIcon className="h-3.5 w-3.5 text-amber-400" /> Find Near You
                </span>
              </div>
              <div className="mb-4 flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={() => switchTo('register')}
                  className="group flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-white shadow-lg transition-all duration-200 hover:bg-amber-600"
                >
                  Register Now <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  type="button"
                  onClick={scrollToAbout}
                  className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/30 px-5 py-2.5 text-xs font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/10"
                >
                  <ShieldCheckIcon className="h-3.5 w-3.5 text-emerald-300" /> Explore Platform
                </button>
              </div>
              <img src={houseWelcome} alt="" className={`mx-auto mt-auto w-full drop-shadow-2xl ${houseSize}`} />
            </div>

            {/* REGISTER OVERLAY CONTENT */}
            <div
              className={`flex flex-col transition-all duration-[450ms] ease-in-out ${
                !isLogin ? 'pointer-events-auto translate-x-0 opacity-100' : 'pointer-events-none absolute inset-0 translate-x-8 opacity-0'
              }`}
            >
              <span className="mb-3 block h-1 w-10 rounded-full bg-amber-400" />
              <h2 className="mb-3 text-3xl font-extrabold leading-tight text-white lg:text-4xl">
                Welcome <span className="text-amber-400">Back!</span>
              </h2>
              <p className="mb-5 max-w-sm text-xs leading-relaxed text-brand-100/90 lg:text-sm">
                Already have an account? Log in to continue browsing and finding your perfect rental home.
              </p>
              <button
                type="button"
                onClick={() => switchTo('login')}
                className="group mb-4 flex w-fit cursor-pointer items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg transition-all duration-200 hover:bg-amber-600"
              >
                <ArrowLeftOnRectangleIcon className="h-4 w-4" /> Login <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </button>
              <img src={houseExplore} alt="" className={`mx-auto mt-auto w-full drop-shadow-2xl ${houseSize}`} />
            </div>
          </div>

          {/* Centered so neither end item sits under the curve. */}
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-white/10 pt-3 text-[10px] font-medium text-brand-100/70">
            <span className="flex items-center gap-1">
              <BuildingOffice2Icon className="h-3 w-3 text-amber-400" /> Verified Listings
            </span>
            <span className="flex items-center gap-1">
              <ShieldCheckIcon className="h-3 w-3 text-amber-400" /> Secure Platform
            </span>
            <span className="flex items-center gap-1">
              <MapPinIcon className="h-3 w-3 text-amber-400" /> Find Your Home
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
