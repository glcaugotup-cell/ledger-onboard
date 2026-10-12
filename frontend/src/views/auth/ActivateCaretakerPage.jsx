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
import { validateGmail, validatePassword } from '../../utils/validators.js';
import { cleanMfaCode } from '../../utils/mfa.js';

const ACTIVATION_CODE = /^[A-Z0-9]{5}-?[A-Z0-9]{5}$/;

function validateActivationCode(code) {
  if (!code) return 'Enter the activation code from your landlord';
  if (!ACTIVATION_CODE.test(code)) return 'The code has 10 letters and numbers, like XXXXX-XXXXX';
  return null;
}

/** One wrong field: its own message on top. Several: how many need fixing. Each field also shows its message. */
function summarize(fieldErrors) {
  const messages = Object.values(fieldErrors).filter(Boolean);
  if (messages.length === 1) return messages[0].endsWith('.') ? messages[0] : `${messages[0]}.`;
  return messages.length ? `Fix the ${messages.length} highlighted fields.` : '';
}

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
  const [fieldErrors, setFieldErrors] = useState({}); // { email, code, password }
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Editing a field clears its own message.
  const onFieldChange = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const showFieldErrors = (errors) => {
    setFieldErrors(errors);
    setError(summarize(errors));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setConfirmError('');

    const errors = {
      email: validateGmail(form.email.trim().toLowerCase()),
      code: validateActivationCode(form.code),
      password: validatePassword(password),
    };
    if (Object.values(errors).some(Boolean)) {
      showFieldErrors(errors);
      return;
    }
    setFieldErrors({});
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
      // A validation error names its fields (email, code, password): show each under its field.
      const { message, fieldErrors: serverErrors } = describeApiError(err);
      const named = { email: serverErrors.email, code: serverErrors.code, password: serverErrors.password };
      if (Object.values(named).some(Boolean)) showFieldErrors(named);
      else setError(message);
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

        <Field required label="Email" error={fieldErrors.email}>
          <TextInput
            type="email"
            maxLength={254}
            value={form.email}
            onChange={(e) => onFieldChange('email', e.target.value)}
            autoComplete="email"
            error={fieldErrors.email}
            required
          />
        </Field>
        <Field required label="Activation code" hint="XXXXX-XXXXX, from your landlord" error={fieldErrors.code}>
          <TextInput
            value={form.code}
            onChange={(e) => onFieldChange('code', cleanMfaCode(e.target.value))}
            error={fieldErrors.code}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={11}
            required
          />
        </Field>

        <div>
          <Field required label="New password" error={fieldErrors.password}>
            <PasswordInput
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              error={fieldErrors.password}
              required
            />
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
