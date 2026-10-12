import { useState } from 'react';
import AuthApi from '../services/AuthApi.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import { Field, TextInput } from './ui/Field.jsx';
import PasswordInput from './ui/PasswordInput.jsx';
import { ErrorBanner, SuccessBanner } from './ui/Feedback.jsx';
import EmailCodeRequestButton from './EmailCodeRequestButton.jsx';
import { cleanAppCode } from '../utils/mfa.js';
import { describeApiError } from '../utils/errors.js';

export default function EmailTwoFactorSettings({ user, onChanged, onCancel }) {
  const enrolled = Boolean(user?.mfaEnabled && user?.emailMfaEnrolled);
  const [step, setStep] = useState(enrolled ? 'idle' : 'password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (step === 'password') {
        await AuthApi.mfaEmailSetup({ password });
        setStep('verify'); setMessage('Check your email for a verification code.');
      } else {
        if (step === 'disable') await AuthApi.mfaDisable({ password, code });
        else await AuthApi.mfaEmailEnable({ code });
        setPassword(''); setCode(''); setStep('idle');
        setMessage(step === 'disable' ? 'Two-factor sign-in is off.' : 'Email two-factor sign-in is on.');
        await onChanged?.(); onCancel?.();
      }
    } catch (err) { setError(describeApiError(err).message); }
    finally { setBusy(false); }
  }
  function cancel() { setPassword(''); setCode(''); setError(''); setMessage(''); setStep('idle'); onCancel?.(); }
  return <Card title="Two-factor authentication">
    <ErrorBanner message={error} /><SuccessBanner message={message} />
    {step === 'idle' && enrolled && <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700">Two-factor sign-in is on.</p>
      <p className="text-sm text-gray-500">Signing in asks for a code sent to your email. Keep access to your mailbox.</p>
      <Button variant="secondary" onClick={() => { setMessage(''); setStep('disable'); }}>Turn off</Button>
    </div>}
    {step !== 'idle' && <form onSubmit={submit} className="space-y-3" noValidate>
      <p className="text-sm text-gray-500">{step === 'password' ? 'Confirm your password to receive an email verification code.' : 'Enter the 6-digit code sent to your email.'}</p>
      {(step === 'password' || step === 'disable') && <Field required label="Current password">
        <PasswordInput value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
      </Field>}
      {step !== 'password' && <>
        <Field required label="Email verification code"><TextInput value={code} onChange={event => setCode(cleanAppCode(event.target.value))}
          inputMode="numeric" autoComplete="one-time-code" maxLength={6} /></Field>
        <EmailCodeRequestButton key={step} initialCooldown={step === 'verify' ? 45 : 0} disabled={busy || !password}
          request={() => step === 'disable' ? AuthApi.mfaEmailCode({ password }) : AuthApi.mfaEmailSetup({ password })} />
      </>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={step === 'disable' ? 'danger' : 'primary'} loading={busy}
          disabled={step === 'password' ? !password : code.length !== 6 || (step === 'disable' && !password)}>
          {step === 'password' ? 'Continue' : step === 'disable' ? 'Turn off two-factor' : 'Turn on'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={cancel}>Cancel</Button>
      </div>
    </form>}
  </Card>;
}
