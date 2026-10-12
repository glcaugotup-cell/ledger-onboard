import { useState } from 'react';
import QRCode from 'qrcode';
import AuthApi from '../services/AuthApi.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import { Field, TextInput } from './ui/Field.jsx';
import { ErrorBanner, SuccessBanner } from './ui/Feedback.jsx';
import PasswordInput from './ui/PasswordInput.jsx';
import { describeApiError } from '../utils/errors.js';
import { MFA_CODE_PROMPT, cleanAppCode, cleanMfaCode, groupSecret } from '../utils/mfa.js';
import EmailTwoFactorSettings from './EmailTwoFactorSettings.jsx';

const BACKUP_FILE_NAME = 'ledger-onboard-backup-codes.txt';

/** The QR code is drawn here in the browser from the otpauth URI; it is never sent anywhere. */
async function qrImageFor(otpauthUri) {
  const svg = await QRCode.toString(otpauthUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Authenticator-app two-factor in Profile: set up (password -> scan -> confirm -> backup codes),
 * new backup codes, and turning it off. Backup codes are shown once and kept only in this component.
 */
export default function TwoFactorCard({ user, onChanged }) {
  const enrolled = Boolean(user?.mfaEnabled && user?.mfaMethod === 'totp');
  // idle | setup-password | setup-scan | backup | disable | regenerate
  const [step, setStep] = useState('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setupInfo, setSetupInfo] = useState(null); // { qrImage, secret, accountName, issuer }
  const [backupCodes, setBackupCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);

  const reset = (nextStep = 'idle') => {
    setStep(nextStep);
    setPassword('');
    setCode('');
    setSetupInfo(null);
    setError('');
    setCopied(false);
  };

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const startSetup = (e) => {
    e.preventDefault();
    run(async () => {
      const { otpauthUri, secret, accountName, issuer } = await AuthApi.mfaSetup({ password });
      setSetupInfo({ qrImage: await qrImageFor(otpauthUri), secret, accountName, issuer });
      setPassword('');
      setStep('setup-scan');
    });
  };

  const confirmSetup = (e) => {
    e.preventDefault();
    run(async () => {
      const result = await AuthApi.mfaEnable({ code });
      setSetupInfo(null);
      setCode('');
      setBackupCodes(result.backupCodes);
      setStep('backup');
      setMessage('Two-factor sign-in is on.');
      await onChanged?.();
    });
  };

  const disable = (e) => {
    e.preventDefault();
    run(async () => {
      await AuthApi.mfaDisable({ password, code });
      reset();
      setMessage('Two-factor sign-in is off.');
      await onChanged?.();
    });
  };

  const regenerate = (e) => {
    e.preventDefault();
    run(async () => {
      const result = await AuthApi.mfaRegenerateBackupCodes({ password, code });
      reset('backup');
      setBackupCodes(result.backupCodes);
      setMessage('New backup codes are ready. The old ones no longer work.');
    });
  };

  const copyCodes = async () => {
    try {
      await navigator.clipboard.writeText(backupCodes.join('\n'));
      setCopied(true);
    } catch {
      setError('Could not copy. Select the codes and copy them, or save them as a file.');
    }
  };

  const saveCodes = () => {
    const text = `Ledger OnBoard backup codes for ${user?.email || 'your account'}\nEach code works once.\n\n${backupCodes.join('\n')}\n`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = BACKUP_FILE_NAME;
    link.click();
    URL.revokeObjectURL(url);
  };

  const finishBackup = () => {
    setBackupCodes([]);
    reset();
  };

  const cancelButton = (
    <Button type="button" variant="ghost" onClick={() => reset()} disabled={busy}>
      Cancel
    </Button>
  );

  const passwordField = (
    <Field required label="Current password">
      <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
    </Field>
  );

  if (step === 'email-setup' || (user?.mfaEnabled && user?.mfaMethod === 'email' && user?.emailMfaEnrolled)) {
    return <EmailTwoFactorSettings user={user} onChanged={onChanged} onCancel={() => reset()} />;
  }

  return (
    <Card title="Two-factor authentication">
      <ErrorBanner message={error} />
      <SuccessBanner message={step === 'idle' || step === 'backup' ? message : ''} />

      {step === 'idle' && !enrolled && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Add a second step to signing in: after your password, enter a 6-digit code from an authenticator app such as Google
            Authenticator or Microsoft Authenticator. No code is ever sent to you.
          </p>
          <Button onClick={() => { setMessage(''); reset('setup-password'); }}>Set up two-factor</Button>
          {user?.emailAccountFlowsAvailable && <Button variant="secondary" onClick={() => { setMessage(''); reset('email-setup'); }}>Set up email codes</Button>}
        </div>
      )}

      {step === 'idle' && enrolled && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Two-factor sign-in is on.</p>
          <p className="text-sm text-gray-500">Signing in asks for a code from your authenticator app, or one of your backup codes.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setMessage(''); reset('regenerate'); }}>Get new backup codes</Button>
            <Button variant="secondary" onClick={() => { setMessage(''); reset('disable'); }}>Turn off</Button>
          </div>
        </div>
      )}

      {step === 'setup-password' && (
        <form onSubmit={startSetup} className="space-y-3" noValidate>
          <p className="text-sm text-gray-500">Confirm it's you to start.</p>
          {passwordField}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} disabled={!password}>Continue</Button>
            {cancelButton}
          </div>
        </form>
      )}

      {step === 'setup-scan' && setupInfo && (
        <form onSubmit={confirmSetup} className="space-y-4" noValidate>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-600">
            <li>Open your authenticator app and add an account.</li>
            <li>Scan this QR code, or type the key below.</li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <img src={setupInfo.qrImage} alt="QR code to scan with your authenticator app" className="h-48 w-48 rounded-lg border border-gray-200 bg-white p-2" />
          <div className="text-sm">
            <p className="text-gray-500">Can't scan? Enter this key in the app (time-based):</p>
            <p className="mt-1 break-all font-mono text-base font-semibold tracking-wider text-gray-900" data-testid="mfa-manual-key">{groupSecret(setupInfo.secret)}</p>
            <p className="mt-1 text-xs text-gray-500">Account: {setupInfo.accountName} · Issuer: {setupInfo.issuer}</p>
          </div>
          <Field required label="Code from the app">
            <TextInput
              value={code}
              onChange={(e) => setCode(cleanAppCode(e.target.value))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} disabled={code.length !== 6}>Turn on</Button>
            {cancelButton}
          </div>
        </form>
      )}

      {step === 'backup' && backupCodes.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">Save these backup codes now.</span> Each one works once, if you can't use your authenticator app. They
            won't be shown again.
          </p>
          <ul className="grid grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm text-gray-900" aria-label="Backup codes">
            {backupCodes.map((c) => <li key={c}>{c}</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={copyCodes}>{copied ? 'Copied' : 'Copy codes'}</Button>
            <Button type="button" variant="secondary" onClick={saveCodes}>Save as file</Button>
            <Button type="button" onClick={finishBackup}>I've saved my codes</Button>
          </div>
        </div>
      )}

      {(step === 'disable' || step === 'regenerate') && (
        <form onSubmit={step === 'disable' ? disable : regenerate} className="space-y-3" noValidate>
          <p className="text-sm text-gray-500">
            {step === 'disable' ? 'To turn off two-factor sign-in, confirm your password and a current code.' : 'New backup codes replace all of your old ones.'}
          </p>
          {passwordField}
          <Field required label="Authenticator or backup code" hint={MFA_CODE_PROMPT}>
            <TextInput
              value={code}
              onChange={(e) => setCode(cleanMfaCode(e.target.value))}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={11}
              placeholder="123456"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant={step === 'disable' ? 'danger' : 'primary'} loading={busy} disabled={!password || !code}>
              {step === 'disable' ? 'Turn off two-factor' : 'Get new backup codes'}
            </Button>
            {cancelButton}
          </div>
        </form>
      )}
    </Card>
  );
}
