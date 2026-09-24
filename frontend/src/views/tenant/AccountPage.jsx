import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthApi from '../../services/AuthApi.js';
import ReviewApi from '../../services/ReviewApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import PasswordInput from '../../components/ui/PasswordInput.jsx';
import PasswordMatchHint from '../../components/ui/PasswordMatchHint.jsx';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator.jsx';
import { describeApiError } from '../../utils/errors.js';
import { sanitizePhoneInput, validateName, validatePassword, validatePhone } from '../../utils/validators.js';

function ReviewForm({ reservation, onSubmitted }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
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
      <div className="mb-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} className={`text-xl ${n <= rating ? 'text-yellow-500' : 'text-gray-300'}`}>
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Share your experience (optional)"
        className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        rows={2}
      />
      <Button onClick={submit} loading={loading} className="w-full">
        Submit review
      </Button>
    </div>
  );
}

export default function AccountPage() {
  const { user, refreshProfile, logout } = useAuth();
  const navigate = useNavigate();

  const [profileForm, setProfileForm] = useState({ firstName: user?.firstName || '', lastName: user?.lastName || '', phone: user?.phone || '' });
  const [profileFieldErrors, setProfileFieldErrors] = useState({});
  const [profileMsg, setProfileMsg] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileLoading, setProfileLoading] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwConfirmError, setPwConfirmError] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwLoading, setPwLoading] = useState(false);

  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState('');

  const [unregisterStep, setUnregisterStep] = useState('idle'); // idle | checking | review | confirm
  const [eligibleReservations, setEligibleReservations] = useState([]);
  const [reviewedIds, setReviewedIds] = useState([]);
  const [unregisterError, setUnregisterError] = useState('');
  const [unregisterLoading, setUnregisterLoading] = useState(false);

  useEffect(() => {
    refreshProfile().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileMsg('');

    // Validate with the same rules as the backend before sending.
    const errors = {
      firstName: validateName(profileForm.firstName),
      lastName: validateName(profileForm.lastName),
      phone: validatePhone(profileForm.phone),
    };
    const firstInvalid = Object.entries(errors).find(([, msg]) => msg);
    setProfileFieldErrors(Object.fromEntries(Object.entries(errors).filter(([, msg]) => msg)));
    if (firstInvalid) return;

    setProfileLoading(true);
    try {
      await AuthApi.updateMe(profileForm);
      setProfileMsg('Profile updated.');
    } catch (err) {
      const { message, fieldErrors } = describeApiError(err);
      setProfileError(message);
      setProfileFieldErrors(fieldErrors);
    } finally {
      setProfileLoading(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwMsg('');
    setPwConfirmError('');

    const passwordError = validatePassword(pwForm.newPassword);
    if (passwordError) {
      setPwError(`${passwordError}.`);
      return;
    }
    if (!pwConfirm) {
      setPwConfirmError('Please confirm your new password.');
      return;
    }
    // Mismatch is already shown live under the field by PasswordMatchHint.
    if (pwConfirm !== pwForm.newPassword) return;

    setPwLoading(true);
    try {
      // pwConfirm is a frontend-only typo guard — never sent to the backend.
      await AuthApi.changePassword(pwForm);
      setPwMsg('Password changed. Please sign in again.');
      setTimeout(() => logout().then(() => navigate('/')), 1500);
    } catch (err) {
      setPwError(describeApiError(err).message);
    } finally {
      setPwLoading(false);
    }
  };

  const startUnregister = async () => {
    setUnregisterStep('checking');
    setUnregisterError('');
    try {
      const { eligibleReservations: list } = await ReviewApi.listEligible();
      if (list.length > 0) {
        setEligibleReservations(list);
        setUnregisterStep('review'); // eligible tenants see the review prompt before closure
      } else {
        setUnregisterStep('confirm'); // ineligible tenant skips straight to confirmation
      }
    } catch (err) {
      setUnregisterError(describeApiError(err).message);
      setUnregisterStep('idle');
    }
  };

  const finalizeUnregister = async () => {
    setUnregisterLoading(true);
    setUnregisterError('');
    try {
      await AuthApi.deactivateAccount();
      await logout();
      navigate('/');
    } catch (err) {
      setUnregisterError(describeApiError(err).message);
    } finally {
      setUnregisterLoading(false);
    }
  };

  const allReviewed = eligibleReservations.every((r) => reviewedIds.includes(r._id));

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

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Account</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <form onSubmit={saveProfile} className="space-y-3">
            <ErrorBanner message={profileError} />
            <SuccessBanner message={profileMsg} />
            <Field label="First name" error={profileFieldErrors.firstName}>
              <TextInput
                value={profileForm.firstName}
                onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                error={profileFieldErrors.firstName}
              />
            </Field>
            <Field label="Last name" error={profileFieldErrors.lastName}>
              <TextInput
                value={profileForm.lastName}
                onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                error={profileFieldErrors.lastName}
              />
            </Field>
            <Field label="Phone" error={profileFieldErrors.phone}>
              <TextInput
                inputMode="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: sanitizePhoneInput(e.target.value) })}
                error={profileFieldErrors.phone}
              />
            </Field>
            <Field label="Email">
              <TextInput value={user?.email || ''} disabled className="bg-gray-50 text-gray-400" />
            </Field>
            <Button type="submit" loading={profileLoading}>
              Save changes
            </Button>
          </form>
        </Card>

        <Card title="Change password">
          <form onSubmit={changePassword} className="space-y-3">
            <ErrorBanner message={pwError} />
            <SuccessBanner message={pwMsg} />
            <Field label="Current password">
              <PasswordInput value={pwForm.currentPassword} onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })} required />
            </Field>
            <div>
              <Field label="New password">
                <PasswordInput value={pwForm.newPassword} onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })} required />
              </Field>
              <PasswordStrengthIndicator password={pwForm.newPassword} />
            </div>
            <div>
              <Field label="Confirm password">
                <PasswordInput
                  value={pwConfirm}
                  onChange={(e) => {
                    setPwConfirm(e.target.value);
                    setPwConfirmError('');
                  }}
                  required
                />
              </Field>
              <PasswordMatchHint password={pwForm.newPassword} confirmPassword={pwConfirm} />
              {pwConfirmError && <p className="mt-2 text-xs text-red-600">{pwConfirmError}</p>}
            </div>
            <Button type="submit" loading={pwLoading}>
              Update password
            </Button>
          </form>
        </Card>

        <Card title="Two-factor authentication">
          <ErrorBanner message={mfaError} />
          <p className="mb-3 text-sm text-gray-500">
            When enabled, we&apos;ll email a 6-digit code you must enter after your password on every sign-in.
          </p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              Email verification code {user?.mfaEnabled ? 'is on' : 'is off'}
            </span>
            <Button variant={user?.mfaEnabled ? 'secondary' : 'primary'} loading={mfaLoading} onClick={toggleMfa}>
              {user?.mfaEnabled ? 'Turn off' : 'Turn on'}
            </Button>
          </div>
        </Card>
      </div>

      <Card title="Close your account" className="mt-6">
        <ErrorBanner message={unregisterError} />
        {unregisterStep === 'idle' && (
          <div>
            <p className="mb-3 text-sm text-gray-500">Your history stays on record; this doesn&apos;t delete anything, it just deactivates your access.</p>
            <Button variant="danger" onClick={startUnregister}>
              Unregister my account
            </Button>
          </div>
        )}
        {unregisterStep === 'checking' && <p className="text-sm text-gray-400">Checking for tenancies you can still review…</p>}
        {unregisterStep === 'review' && (
          <div>
            <p className="mb-3 text-sm text-gray-700">
              Before you go — you have {eligibleReservations.length} completed tenanc{eligibleReservations.length === 1 ? 'y' : 'ies'} you haven&apos;t reviewed yet.
              Leave a review to help future tenants (optional).
            </p>
            <div className="space-y-3">
              {eligibleReservations.map((r) =>
                reviewedIds.includes(r._id) ? (
                  <p key={r._id} className="text-sm text-green-600">✓ Reviewed {r.propertyId?.propertyName}</p>
                ) : (
                  <ReviewForm key={r._id} reservation={r} onSubmitted={(id) => setReviewedIds((prev) => [...prev, id])} />
                )
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" onClick={() => setUnregisterStep('confirm')} className="flex-1">
                {allReviewed ? 'Continue' : 'Skip review & continue'}
              </Button>
              <Button variant="ghost" onClick={() => setUnregisterStep('idle')}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {unregisterStep === 'confirm' && (
          <div>
            <p className="mb-3 text-sm text-gray-700">This will deactivate your account and log you out. Are you sure?</p>
            <div className="flex gap-2">
              <Button variant="danger" onClick={finalizeUnregister} loading={unregisterLoading} className="flex-1">
                Yes, deactivate my account
              </Button>
              <Button variant="ghost" onClick={() => setUnregisterStep('idle')}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </DashboardLayout>
  );
}
