import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import AuthApi from '../../services/AuthApi.js';
import ReviewApi from '../../services/ReviewApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx';
import { Field, FieldRequirement, TextArea, TextInput } from '../../components/ui/Field.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import PasswordInput from '../../components/ui/PasswordInput.jsx';
import PasswordMatchHint from '../../components/ui/PasswordMatchHint.jsx';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator.jsx';
import PhoneInput from '../../components/ui/PhoneInput.jsx';
import { ReviewForm } from '../../components/ReviewForm.jsx';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst, toNameCase } from '../../utils/textFormat.js';
import { formatDate, formatStatus } from '../../utils/format.js';
import { PATTERNS, validateName, validatePassword, validatePhone } from '../../utils/validators.js';

const ROLE_LABEL = { tenant: 'Tenant', landlord: 'Landlord', caretaker: 'Caretaker', admin: 'Administrator' };

/** One read-only line of registered information. */
function InfoRow({ label, value, hint }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-gray-100 py-2.5 last:border-b-0 sm:grid-cols-3 sm:gap-3">
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="break-words text-sm font-medium text-gray-900 sm:col-span-2">
        {value || <span className="font-normal text-gray-500">Not provided</span>}
        {hint && <span className="mt-0.5 block text-xs font-normal text-gray-500">{hint}</span>}
      </dd>
    </div>
  );
}

function PaymentQrSettings({ hasQr }) {
  const { refreshProfile } = useAuth();
  const [qrUrl, setQrUrl] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let objectUrl;
    if (hasQr) AuthApi.fetchPaymentQrObjectUrl().then((url) => { objectUrl = url; setQrUrl(url); }).catch((err) => setError(describeApiError(err).message));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [hasQr]);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError('');
    setMessage('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPEG, PNG or WEBP QR image.');
      return;
    }
    setLoading(true);
    try {
      const form = new FormData();
      form.append('paymentQr', file);
      await AuthApi.uploadPaymentQr(form);
      const url = await AuthApi.fetchPaymentQrObjectUrl();
      setQrUrl((old) => { if (old) URL.revokeObjectURL(old); return url; });
      setMessage('GCash QR code saved. Tenants can now view it on their statements.');
      // Clears the "upload your GCash QR" banner and move-in gate on the other screens.
      refreshProfile?.().catch(() => {});
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="GCash payment QR code" className="mt-6">
      <p className="mb-3 text-sm text-gray-500">Upload your GCash QR code. It will appear privately on your tenants’ billing statements. It is required: tenants can’t pay by GCash, and you can’t confirm a move-in, until it is uploaded.</p>
      <ErrorBanner message={error} />
      <SuccessBanner message={message} />
      {qrUrl && <img src={qrUrl} alt="Your GCash payment QR code" className="mb-3 max-h-56 rounded-lg border border-gray-200 object-contain" />}
      <p className="mb-1.5 text-sm font-medium text-gray-700">GCash QR code<FieldRequirement required /></p>
      {!hasQr && !qrUrl && <p className="mb-2 text-xs font-medium text-red-600">No GCash QR code yet. Upload one to continue.</p>}
      <label className="inline-flex cursor-pointer items-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800">
        {loading ? 'Uploading…' : hasQr || qrUrl ? 'Replace QR code' : 'Upload QR code'}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={loading} className="sr-only" />
      </label>
    </Card>
  );
}

/**
 * Profile for every role (tenant, landlord, caretaker, admin): the registered
 * email and role (shown but never editable — the backend rejects changes to them
 * too), an editable name, phone and emergency contact (the admin edits only the
 * phone), password change by emailed
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

  // Tenants, landlords and caretakers can edit their name, phone and emergency contact; email and role stay fixed.
  const canEditDetails = role !== 'admin';
  const [details, setDetails] = useState(() => ({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    emergencyName: user?.emergencyContact?.name || '',
    emergencyPhone: user?.emergencyContact?.phone || '',
  }));
  const [detailErrors, setDetailErrors] = useState({});
  const setDetail = (key, value) => {
    setDetails((prev) => ({ ...prev, [key]: value }));
    if (detailErrors[key]) setDetailErrors((prev) => ({ ...prev, [key]: '' }));
  };

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
  const [closeReason, setCloseReason] = useState('');
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

  const saveDetails = async (e) => {
    e.preventDefault();
    setProfileError('');
    setProfileMsg('');
    const firstName = toNameCase(details.firstName.trim());
    const lastName = toNameCase(details.lastName.trim());
    const emergencyName = toNameCase(details.emergencyName.trim());
    // Tenants registered with an emergency contact, so they keep one; for others it is optional (both fields or neither).
    const wantsEmergency = role === 'tenant' || emergencyName || details.emergencyPhone;
    const errors = {
      firstName: validateName(firstName) || '',
      lastName: validateName(lastName) || '',
      phone: validatePhone(details.phone) || '',
      emergencyName: wantsEmergency ? validateName(emergencyName) || '' : '',
      emergencyPhone: wantsEmergency ? validatePhone(details.emergencyPhone) || '' : '',
    };
    setDetails((prev) => ({ ...prev, firstName, lastName, emergencyName }));
    setDetailErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    setProfileLoading(true);
    try {
      // Email and role are never sent; the backend rejects them anyway.
      await AuthApi.updateMe({
        firstName,
        lastName,
        phone: details.phone,
        ...(wantsEmergency ? { emergencyContact: { name: emergencyName, phone: details.emergencyPhone } } : {}),
      });
      await refreshProfile().catch(() => {});
      setProfileMsg('Your details were updated.');
    } catch (err) {
      const { message, fieldErrors } = describeApiError(err);
      setProfileError(message);
      setDetailErrors({
        firstName: fieldErrors.firstName || '',
        lastName: fieldErrors.lastName || '',
        phone: fieldErrors.phone || '',
        emergencyName: fieldErrors['emergencyContact.name'] || '',
        emergencyPhone: fieldErrors['emergencyContact.phone'] || '',
      });
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
      if (closeReason.trim().length < 3) {
        setCloseError('Please enter a reason (at least 3 characters).');
        return;
      }
      await AuthApi.deactivateAccount(closeReason.trim());
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
      <PageHeader title="Profile" description="Your account details, password and sign-in security." />
      <div className={`grid grid-cols-1 gap-6 ${role === 'caretaker' ? 'lg:grid-cols-1' : 'lg:grid-cols-2'}`}>
        <Card title="Personal information">
          <dl className="mb-4">
            {!canEditDetails && <InfoRow label="Full name" value={user?.fullName} hint="Your registered name can’t be changed here." />}
            <InfoRow label="Email" value={user?.email} hint="Your sign-in email can’t be changed." />
            <InfoRow label="Role" value={ROLE_LABEL[role] || role} hint={canEditDetails ? 'Your role can’t be changed.' : undefined} />
            {role === 'caretaker' && (
              <InfoRow label="Service barangay" value={user?.serviceBarangay} hint="Set by your landlord; used to match you with boarding houses nearby." />
            )}
            {role === 'landlord' && (
              <InfoRow label="Business verification" value={user?.businessVerificationStatus ? formatStatus(user.businessVerificationStatus) : 'Not submitted'} />
            )}
            {user?.createdAt && <InfoRow label="Member since" value={formatDate(user.createdAt)} />}
          </dl>

          {canEditDetails ? (
            <form onSubmit={saveDetails} className="space-y-3" noValidate>
              <ErrorBanner message={profileError} />
              <SuccessBanner message={profileMsg} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field required label="First name" error={detailErrors.firstName}>
                  <TextInput maxLength={80} value={details.firstName} onChange={(e) => setDetail('firstName', capitalizeFirst(e.target.value))} onBlur={() => setDetail('firstName', toNameCase(details.firstName))} error={detailErrors.firstName} />
                </Field>
                <Field required label="Last name" error={detailErrors.lastName}>
                  <TextInput maxLength={80} value={details.lastName} onChange={(e) => setDetail('lastName', capitalizeFirst(e.target.value))} onBlur={() => setDetail('lastName', toNameCase(details.lastName))} error={detailErrors.lastName} />
                </Field>
              </div>
              <Field required label="Phone" error={detailErrors.phone}>
                <PhoneInput value={details.phone} onChange={(value) => setDetail('phone', value)} placeholder="917 123 4567" error={detailErrors.phone} />
              </Field>
              <fieldset className="rounded-lg border border-gray-200 p-3">
                <legend className="px-1 text-sm font-medium text-gray-700">Emergency contact<FieldRequirement required={role === 'tenant'} /></legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field required={role === 'tenant'} label="Emergency contact name" error={detailErrors.emergencyName}>
                    <TextInput maxLength={80} value={details.emergencyName} onChange={(e) => setDetail('emergencyName', capitalizeFirst(e.target.value))} onBlur={() => setDetail('emergencyName', toNameCase(details.emergencyName))} error={detailErrors.emergencyName} />
                  </Field>
                  <Field required={role === 'tenant'} label="Emergency contact phone" error={detailErrors.emergencyPhone}>
                    <PhoneInput value={details.emergencyPhone} onChange={(value) => setDetail('emergencyPhone', value)} placeholder="917 123 4567" error={detailErrors.emergencyPhone} />
                  </Field>
                </div>
              </fieldset>
              <Button type="submit" loading={profileLoading}>
                Save changes
              </Button>
            </form>
          ) : (
            <form onSubmit={savePhone} className="space-y-3" noValidate>
              <ErrorBanner message={profileError} />
              <SuccessBanner message={profileMsg} />
              <Field required label="Phone" error={phoneError}>
                <PhoneInput
                  value={phone}
                  onChange={(value) => {
                    setPhone(value);
                    if (phoneError) setPhoneError('');
                  }}
                  placeholder="917 123 4567"
                  error={phoneError}
                />
              </Field>
              <Button type="submit" loading={profileLoading}>
                Save phone number
              </Button>
            </form>
          )}
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
              <Field required label="Code from the email" error={pwErrors.code}>
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
                <Field required label="New password" error={pwErrors.newPassword}>
                  <PasswordInput value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
                </Field>
                <PasswordStrengthIndicator password={pwNew} />
              </div>
              <div>
                <Field required label="Confirm password" error={pwErrors.confirm}>
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

      {role === 'landlord' && <PaymentQrSettings hasQr={Boolean(user?.hasPaymentQr)} />}

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
          {closeStep === 'checking' && <p className="text-sm text-gray-500">Checking for tenancies you can still review…</p>}
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
            confirmDisabled={closeReason.trim().length < 3}
            confirmLabel="Yes, delete my account"
            loading={closeLoading}
            error={closeError}
            onConfirm={finalizeClose}
            onCancel={() => {
              setCloseStep('idle');
              setCloseError('');
            }}
          >
            <Field required label="Why are you leaving?">
              <TextArea value={closeReason} onChange={(e) => setCloseReason(e.target.value)} maxLength={500} rows={3} placeholder="Please tell us why you are leaving" />
            </Field>
          </ConfirmDialog>
        </Card>
      )}
    </DashboardLayout>
  );
}
