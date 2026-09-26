import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthApi from '../../services/AuthApi.js';
import ReviewApi from '../../services/ReviewApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { Field, TextArea, TextInput } from '../../components/ui/Field.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import PasswordInput from '../../components/ui/PasswordInput.jsx';
import PasswordMatchHint from '../../components/ui/PasswordMatchHint.jsx';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator.jsx';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst } from '../../utils/textFormat.js';
import { PATTERNS, sanitizePhoneInput, validatePassword, validatePhone } from '../../utils/validators.js';

const ROLE_LABEL = { tenant: 'Tenant', landlord: 'Landlord', caretaker: 'Caretaker', admin: 'Administrator' };
const MAX_REVIEW_COMMENT = 2000;

/** One read-only line of registered information. */
function InfoRow({ label, value, hint }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-gray-100 py-2.5 last:border-b-0 sm:grid-cols-3 sm:gap-3">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="break-words text-sm font-medium text-gray-900 sm:col-span-2">
        {value || <span className="font-normal text-gray-400">Not provided</span>}
        {hint && <span className="mt-0.5 block text-xs font-normal text-gray-400">{hint}</span>}
      </dd>
    </div>
  );
}

function ReviewForm({ reservation, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (comment.length > MAX_REVIEW_COMMENT) {
      setError(`Keep your review under ${MAX_REVIEW_COMMENT} characters.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await ReviewApi.submit(reservation.propertyId._id || reservation.propertyId, { reservationId: reservation._id, rating, comment });
      onSubmitted(reservation._id);
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="mb-2 text-sm font-medium text-gray-800">{reservation.propertyId?.propertyName || 'Your stay'}</p>
      <ErrorBanner message={error} />
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === rating}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => setRating(n)}
            className={`text-xl ${n <= rating ? 'text-yellow-500' : 'text-gray-300'}`}
          >
            ★
          </button>
        ))}
      </div>
      <TextArea
        value={comment}
        onChange={(e) => setComment(capitalizeFirst(e.target.value))}
        placeholder="Share your experience (optional)"
        maxLength={MAX_REVIEW_COMMENT}
        className="mb-2"
        rows={2}
      />
      <Button onClick={submit} loading={loading} className="w-full">
        Submit review
      </Button>
    </div>
  );
}

/**
 * Profile for every role (tenant, landlord, caretaker, admin): the registered
 * details (name and email are shown but can't be edited — the backend rejects
 * changes to them too), an editable phone number, password change by emailed
 * code, email-code sign-in, and — for everyone except admins — closing the
 * account. Closing never deletes data; it deactivates the account.
 */
export default function ProfilePage() {
  const { user, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  const [phone, setPhone] = useState(user?.phone || '');
  const [phoneError, setPhoneError] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  // Password change: 'idle' -> 'code' (a code was emailed) -> done (signed out).
  const [pwStep, setPwStep] = useState('idle');
  const [pwCode, setPwCode] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwErrors, setPwErrors] = useState({});
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');

  // Account closure. Tenants go through the existing unregister flow (review prompt first).
  const [closeStep, setCloseStep] = useState('idle'); // idle | checking | review | confirm
  const [eligibleReservations, setEligibleReservations] = useState([]);
  const [reviewedIds, setReviewedIds] = useState([]);
  const [closeError, setCloseError] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);

  useEffect(() => {
    // Refreshes the read-only details; the phone field keeps whatever the user is typing.
    refreshProfile().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePhone = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileMsg('');
    const error = validatePhone(phone);
    setPhoneError(error || '');
    if (error) return;

    setProfileLoading(true);
    try {
      // Only the phone is sent: name and email are fixed identity fields.
      await AuthApi.updateMe({ phone });
      await refreshProfile().catch(() => {});
      setProfileMsg('Phone number updated.');
    } catch (err) {
      const { message, fieldErrors } = describeApiError(err);
      setProfileError(message);
      setPhoneError(fieldErrors.phone || '');
    } finally {
      setProfileLoading(false);
    }
  };

  const sendPasswordCode = async () => {
    setPwError('');
    setPwMsg('');
    setPwLoading(true);
    try {
      // Reuses the secure reset flow: a short-lived code goes to the registered email only.
      await AuthApi.forgotPassword({ email: user.email });
      setPwStep('code');
      setPwMsg(`We sent a 6-digit code to ${user.email}. It expires in a few minutes.`);
    } catch (err) {
      setPwError(describeApiError(err).message);
    } finally {
      setPwLoading(false);
    }
  };

  const submitPasswordChange = async (e) => {
    e.preventDefault();
    setPwError('');
    const errors = {};
    if (!PATTERNS.OTP.test(pwCode)) errors.code = 'Enter the 6-digit code from the email.';
    const passwordError = validatePassword(pwNew);
    if (passwordError) errors.newPassword = passwordError.endsWith('.') ? passwordError : `${passwordError}.`;
    if (!pwConfirm) errors.confirm = 'Please confirm your new password.';
    else if (pwConfirm !== pwNew) errors.confirm = 'Passwords do not match.';
    setPwErrors(errors);
    if (Object.keys(errors).length) return;

    setPwLoading(true);
    try {
      await AuthApi.resetPassword({ email: user.email, code: pwCode, newPassword: pwNew });
      setPwMsg('Password changed. Please sign in again with your new password.');
      setTimeout(() => logout().then(() => navigate('/')), 1500);
    } catch (err) {
      const { message, fieldErrors } = describeApiError(err);
      setPwError(message);
      setPwErrors({ code: fieldErrors.code, newPassword: fieldErrors.newPassword });
    } finally {
      setPwLoading(false);
    }
  };

  const cancelPasswordChange = () => {
    setPwStep('idle');
    setPwCode('');
    setPwNew('');
    setPwConfirm('');
    setPwErrors({});
    setPwMsg('');
    setPwError('');
  };

  const toggleMfa = async () => {
    setMfaLoading(true);
    setMfaError('');
    try {
      await AuthApi.setMfaPreference(!user?.mfaEnabled);
      await refreshProfile();
    } catch (err) {
      setMfaError(describeApiError(err).message);
    } finally {
      setMfaLoading(false);
    }
  };

  const startClose = async () => {
    setCloseError('');
    if (role !== 'tenant') {
      setCloseStep('confirm');
      return;
    }
    setCloseStep('checking');
    try {
      const { eligibleReservations: list } = await ReviewApi.listEligible();
      if (list.length > 0) {
        setEligibleReservations(list);
        setCloseStep('review'); // eligible former tenants are invited to review first
      } else {
        setCloseStep('confirm');
      }
    } catch (err) {
      setCloseError(describeApiError(err).message);
      setCloseStep('idle');
    }
  };

  const finalizeClose = async () => {
    setCloseLoading(true);
    setCloseError('');
    try {
      await AuthApi.deactivateAccount();
      await logout();
      navigate('/');
    } catch (err) {
      setCloseError(describeApiError(err).message);
    } finally {
      setCloseLoading(false);
    }
  };

  const allReviewed = eligibleReservations.every((r) => reviewedIds.includes(r._id));
  const closeConsequence =
    role === 'landlord'
      ? 'You will be signed out and won’t be able to sign in again. Your boarding houses will stop appearing in search, but your properties, rooms, reservations, bills, payments and caretaker records are kept, not deleted. You must first answer pending reservation requests and complete or cancel current tenancies.'
      : role === 'caretaker'
        ? 'You will be signed out and won’t be able to sign in again. The utility readings, cash payments and other records you logged are kept and stay visible to your landlord.'
        : 'You will be signed out and won’t be able to sign in again. Your reservation, billing and payment history stays on record; nothing is deleted.';

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Profile</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Personal information">
          <dl className="mb-4">
            <InfoRow label="Full name" value={user?.fullName} hint="Your registered name can’t be changed here." />
            <InfoRow label="Email" value={user?.email} hint="Your sign-in email can’t be changed." />
            <InfoRow label="Role" value={ROLE_LABEL[role] || role} />
            {role === 'tenant' && (
              <InfoRow
                label="Emergency contact"
                value={user?.emergencyContact?.name ? `${user.emergencyContact.name} · ${user.emergencyContact.phone || ''}` : null}
              />
            )}
            {role === 'caretaker' && (
              <InfoRow label="Service barangay" value={user?.serviceBarangay} hint="Set by your landlord; used to match you with boarding houses nearby." />
            )}
            {role === 'landlord' && (
              <InfoRow label="Business verification" value={user?.businessVerificationStatus ? user.businessVerificationStatus.toLowerCase() : 'Not submitted'} />
            )}
            {user?.createdAt && <InfoRow label="Member since" value={new Date(user.createdAt).toLocaleDateString(undefined, { dateStyle: 'long' })} />}
          </dl>

          <form onSubmit={savePhone} className="space-y-3" noValidate>
            <ErrorBanner message={profileError} />
            <SuccessBanner message={profileMsg} />
            <Field label="Phone" error={phoneError}>
              <TextInput
                inputMode="tel"
                placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                maxLength={13}
                value={phone}
                onChange={(e) => {
                  setPhone(sanitizePhoneInput(e.target.value));
                  if (phoneError) setPhoneError('');
                }}
                error={phoneError}
              />
            </Field>
            <Button type="submit" loading={profileLoading}>
              Save phone number
            </Button>
          </form>
        </Card>

        <Card title="Change password">
          <ErrorBanner message={pwError} />
          <SuccessBanner message={pwMsg} />
          {pwStep === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                For your security, we’ll email a 6-digit code to <span className="font-medium text-gray-700">{user?.email}</span>. Enter it here with your new
                password. Your current password is never shown.
              </p>
              <Button onClick={sendPasswordCode} loading={pwLoading}>
                Email me a code
              </Button>
            </div>
          )}
          {pwStep === 'code' && (
            <form onSubmit={submitPasswordChange} className="mt-3 space-y-3" noValidate>
              <Field label="Code from the email" error={pwErrors.code}>
                <TextInput
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={pwCode}
                  onChange={(e) => setPwCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  error={pwErrors.code}
                />
              </Field>
              <div>
                <Field label="New password" error={pwErrors.newPassword}>
                  <PasswordInput value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
                </Field>
                <PasswordStrengthIndicator password={pwNew} />
              </div>
              <div>
                <Field label="Confirm password" error={pwErrors.confirm}>
                  <PasswordInput value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
                </Field>
                <PasswordMatchHint password={pwNew} confirmPassword={pwConfirm} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={pwLoading}>
                  Update password
                </Button>
                <Button type="button" variant="ghost" onClick={sendPasswordCode} disabled={pwLoading}>
                  Resend code
                </Button>
                <Button type="button" variant="ghost" onClick={cancelPasswordChange} disabled={pwLoading}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card title="Two-factor authentication">
          <ErrorBanner message={mfaError} />
          <p className="mb-3 text-sm text-gray-500">When enabled, we&apos;ll email a 6-digit code you must enter after your password on every sign-in.</p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-gray-700">Email verification code {user?.mfaEnabled ? 'is on' : 'is off'}</span>
            <Button variant={user?.mfaEnabled ? 'secondary' : 'primary'} loading={mfaLoading} onClick={toggleMfa}>
              {user?.mfaEnabled ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
        </Card>
      </div>

      {role !== 'admin' && (
        <Card title="Delete account" className="mt-6">
          <ErrorBanner message={closeStep !== 'confirm' ? closeError : ''} />
          {(closeStep === 'idle' || closeStep === 'confirm') && (
            <div>
              <p className="mb-3 text-sm text-gray-500">
                Closes your account and signs you out. Your history stays on record — this deactivates your access; it doesn&apos;t erase your data.
              </p>
              <Button variant="danger" onClick={startClose}>
                Delete account
              </Button>
            </div>
          )}
          {closeStep === 'checking' && <p className="text-sm text-gray-400">Checking for tenancies you can still review…</p>}
          {closeStep === 'review' && (
            <div>
              <p className="mb-3 text-sm text-gray-700">
                Before you go — you have {eligibleReservations.length} completed tenanc{eligibleReservations.length === 1 ? 'y' : 'ies'} you haven&apos;t reviewed
                yet. Leave a review to help future tenants (optional).
              </p>
              <div className="space-y-3">
                {eligibleReservations.map((r) =>
                  reviewedIds.includes(r._id) ? (
                    <p key={r._id} className="text-sm text-green-600">
                      ✓ Reviewed {r.propertyId?.propertyName}
                    </p>
                  ) : (
                    <ReviewForm key={r._id} reservation={r} onSubmitted={(id) => setReviewedIds((prev) => [...prev, id])} />
                  )
                )}
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary" onClick={() => setCloseStep('confirm')} className="flex-1">
                  {allReviewed ? 'Continue' : 'Skip review & continue'}
                </Button>
                <Button variant="ghost" onClick={() => setCloseStep('idle')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <ConfirmDialog
            open={closeStep === 'confirm'}
            tone="danger"
            title="Delete your account?"
            message={closeConsequence}
            confirmLabel="Yes, delete my account"
            loading={closeLoading}
            error={closeError}
            onConfirm={finalizeClose}
            onCancel={() => {
              setCloseStep('idle');
              setCloseError('');
            }}
          />
        </Card>
      )}
    </DashboardLayout>
  );
}
