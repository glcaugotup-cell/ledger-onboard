import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthApi from '../../services/AuthApi.js';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import Button from '../../components/ui/Button.jsx';
import PasswordInput from '../../components/ui/PasswordInput.jsx';
import PasswordMatchHint from '../../components/ui/PasswordMatchHint.jsx';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import PrivacyPolicyModal from '../../components/PrivacyPolicyModal.jsx';
import { describeApiError } from '../../utils/errors.js';
import { normalizePhToE164, sanitizePhoneInput, validateGmail, validateName, validatePassword, validatePhone } from '../../utils/validators.js';
import { toNameCase } from '../../utils/textFormat.js';
import { useAuthedRedirect } from '../../routes/useAuthedRedirect.js';

const RESEND_COOLDOWN_SECONDS = 45;

const initialForm = {
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

// Same rules the backend enforces. Emergency contact fields are only required for tenants.
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

// Applied on blur and again before submit; mirrors the backend sanitizers.
const NORMALIZERS = {
  firstName: toNameCase,
  lastName: toNameCase,
  emergencyContactName: toNameCase,
  phone: normalizePhToE164,
  emergencyContactPhone: normalizePhToE164,
};

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
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

  useAuthedRedirect();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    const validate = FIELD_VALIDATORS[key] || EMERGENCY_CONTACT_VALIDATORS[key];
    if (validate && errors[key]) {
      const err = validate(value);
      setErrors((prev) => ({ ...prev, [key]: err || undefined }));
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
    if (validate) {
      const err = validate(normalizedValue);
      setErrors((prev) => ({ ...prev, [key]: err || undefined }));
    }
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
    if (values.confirmPassword !== values.password) {
      nextErrors.confirmPassword = 'Passwords do not match';
    }
    if (values.role === 'tenant') {
      for (const key of Object.keys(EMERGENCY_CONTACT_VALIDATORS)) {
        const err = EMERGENCY_CONTACT_VALIDATORS[key](values[key]);
        if (err) nextErrors[key] = err;
      }
    }
    if (!values.privacyConsent) {
      nextErrors.privacyConsent = 'You must agree to the Privacy Policy to continue';
    }
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
      // confirmPassword is a frontend-only typo guard and is never sent to the backend.
      const { firstName, lastName, email, phone, password, role, privacyConsent, emergencyContactName, emergencyContactPhone } = normalizedForm;
      const payload = { firstName, lastName, email, phone, password, role, privacyConsent };
      if (role === 'tenant') {
        payload.emergencyContact = { name: emergencyContactName, phone: emergencyContactPhone };
      }
      await register(payload);
      // register() already sent the first OTP, so start the resend cooldown now.
      setRegisteredEmail(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setVerifyInfo('');
      setStep('verify');
    } catch (err) {
      const { message, code, fieldErrors } = describeApiError(err);
      if (code === 'ACCOUNT_PENDING_VERIFICATION') {
        // Pending unverified registration: the backend re-sent a code, so resume verification.
        setRegisteredEmail(email);
        setCooldown(RESEND_COOLDOWN_SECONDS);
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
      setCooldown(RESEND_COOLDOWN_SECONDS);
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

  if (step === 'verify') {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Verify Your Email</h1>
        <p className="mt-1 text-sm text-gray-500">
          We sent a 6-digit code to <span className="font-medium text-gray-700">{registeredEmail}</span>. Enter it below to activate your account.
        </p>
        <SuccessBanner message={verifyInfo} />

        <form onSubmit={onVerifyOtp} className="mt-6 space-y-4" noValidate>
          <ErrorBanner message={otpError} />
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
          <Button type="submit" variant="accent" className="w-full" loading={verifying}>
            Verify Email
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            disabled={cooldown > 0 || resending}
            onClick={onResendOtp}
          >
            {resending ? 'Resending…' : cooldown > 0 ? `Resend OTP in ${cooldown} seconds` : 'Resend OTP'}
          </Button>
          <Button type="button" variant="danger" className="w-full" loading={cancelling} onClick={onCancelVerification}>
            Cancel
          </Button>
          <p className="text-center text-xs text-gray-400">Entered the wrong email or details? Cancel to go back and register again.</p>
        </form>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Registration successful!</h1>
        <SuccessBanner message="Your email has been verified successfully. You can now log in to your account." />
        <Button variant="accent" className="mt-6 w-full" onClick={() => navigate('/')}>
          Go to Login
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
      <p className="mt-1 text-sm text-gray-500">Join Ledger OnBoard to start your journey.</p>
      <SuccessBanner message={cancelMessage} />

      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <ErrorBanner message={submitError} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" error={touched.firstName ? errors.firstName : undefined} hint="Starts with an uppercase letter — letters, spaces, hyphens, and periods only">
            <TextInput
              value={form.firstName}
              onChange={(e) => updateField('firstName', e.target.value)}
              onBlur={() => onBlur('firstName')}
              placeholder="Juan"
              error={touched.firstName ? errors.firstName : undefined}
            />
          </Field>

          <Field label="Last name" error={touched.lastName ? errors.lastName : undefined} hint="Starts with an uppercase letter — letters, spaces, hyphens, and periods only">
            <TextInput
              value={form.lastName}
              onChange={(e) => updateField('lastName', e.target.value)}
              onBlur={() => onBlur('lastName')}
              placeholder="Dela Cruz"
              error={touched.lastName ? errors.lastName : undefined}
            />
          </Field>
        </div>

        <Field label="Email (Gmail only)" error={touched.email ? errors.email : undefined}>
          <TextInput
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            onBlur={() => onBlur('email')}
            placeholder="you@gmail.com"
            error={touched.email ? errors.email : undefined}
          />
        </Field>

        <Field
          label="Phone (Philippines, +63)"
          error={touched.phone ? errors.phone : undefined}
          hint="Enter as 09171234567 or +639171234567 — we'll store it as +639171234567"
        >
          <TextInput
            inputMode="tel"
            value={form.phone}
            onChange={(e) => updateField('phone', sanitizePhoneInput(e.target.value))}
            onBlur={() => onBlur('phone')}
            placeholder="+63 917 123 4567"
            error={touched.phone ? errors.phone : undefined}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Field label="Password">
              <PasswordInput
                value={form.password}
                onChange={(e) => updateField('password', e.target.value)}
                onBlur={() => onBlur('password')}
                error={touched.password ? errors.password : undefined}
              />
            </Field>
            <PasswordStrengthIndicator password={form.password} />
            {touched.password && errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
          </div>

          <div>
            {/* A mismatch is shown live by PasswordMatchHint; the field error only covers an empty confirm. */}
            <Field label="Confirm password" error={touched.confirmPassword && !form.confirmPassword ? errors.confirmPassword : undefined}>
              <PasswordInput
                value={form.confirmPassword}
                onChange={(e) => updateConfirmPassword(e.target.value)}
                onBlur={onBlurConfirmPassword}
                error={touched.confirmPassword ? errors.confirmPassword : undefined}
              />
            </Field>
            <PasswordMatchHint password={form.password} confirmPassword={form.confirmPassword} />
          </div>
        </div>

        <Field label="I am a...">
          <Select value={form.role} onChange={(e) => updateField('role', e.target.value)}>
            <option value="tenant">Tenant</option>
            <option value="landlord">Landlord</option>
          </Select>
        </Field>

        {form.role === 'tenant' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Emergency contact person"
              error={touched.emergencyContactName ? errors.emergencyContactName : undefined}
              hint="Someone your landlord can reach if something happens to you"
            >
              <TextInput
                value={form.emergencyContactName}
                onChange={(e) => updateField('emergencyContactName', e.target.value)}
                onBlur={() => onBlur('emergencyContactName')}
                placeholder="Maria Dela Cruz"
                error={touched.emergencyContactName ? errors.emergencyContactName : undefined}
              />
            </Field>

            <Field label="Emergency contact CP number" error={touched.emergencyContactPhone ? errors.emergencyContactPhone : undefined}>
              <TextInput
                inputMode="tel"
                value={form.emergencyContactPhone}
                onChange={(e) => updateField('emergencyContactPhone', sanitizePhoneInput(e.target.value))}
                onBlur={() => onBlur('emergencyContactPhone')}
                placeholder="09171234567"
                error={touched.emergencyContactPhone ? errors.emergencyContactPhone : undefined}
              />
            </Field>
          </div>
        )}

        <div>
          <label className="flex items-start gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.privacyConsent}
              onChange={(e) => toggleConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
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
                className="cursor-pointer font-medium text-gray-800 underline decoration-dotted underline-offset-2 hover:text-brand-700"
              >
                Privacy Policy
              </button>{' '}
              — my information is collected only to run this platform (registration, reservations, billing, and safety) and won&apos;t be used
              beyond that.
            </span>
          </label>
          {touched.privacyConsent && errors.privacyConsent && <p className="mt-1 text-xs text-red-600">{errors.privacyConsent}</p>}
        </div>
        <PrivacyPolicyModal open={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />

        <Button type="submit" variant="accent" className="w-full" loading={loading}>
          Register
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-700 hover:underline">
          Login
        </Link>
      </p>
    </div>
  );
}
