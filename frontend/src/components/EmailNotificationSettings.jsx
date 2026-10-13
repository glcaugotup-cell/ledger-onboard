import { useEffect, useState } from 'react';
import AuthApi from '../services/AuthApi.js';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import PasswordInput from './ui/PasswordInput.jsx';
import { Field, TextInput } from './ui/Field.jsx';
import { ErrorBanner, SuccessBanner } from './ui/Feedback.jsx';
import { describeApiError } from '../utils/errors.js';

export default function EmailNotificationSettings({ user, onChanged }) {
  const [step, setStep] = useState('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const confirmed = Boolean(user?.emailNotificationsConfirmed);
  const enabled = confirmed && user?.notificationPreferences?.email !== false;
  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  const cancel = () => { setStep('idle'); setPassword(''); setCode(''); setError(''); };
  const run = async action => {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (err) {
      setError(describeApiError(err).message);
      const retry = err.details?.retryAfterSeconds;
      if (retry) setCooldown(retry);
    } finally { setBusy(false); }
  };
  const requestCode = e => {
    e.preventDefault();
    return run(async () => {
      const result = await AuthApi.requestNotificationEmail({ password });
      setCooldown(result.resendAfterSeconds || 45); setStep('code'); setCode('');
      setMessage('Check your inbox or spam folder for the confirmation code.');
    });
  };
  const finish = e => {
    e.preventDefault();
    return run(async () => {
      await AuthApi.confirmNotificationEmail({ code });
      cancel(); await onChanged?.(); setMessage('Email notifications are enabled.');
    });
  };
  const toggle = () => run(async () => {
    await AuthApi.updateMe({ notificationPreferences: { email: !enabled } });
    await onChanged?.(); setMessage(enabled ? 'Email notifications are off.' : 'Email notifications are enabled.');
  });
  return (
    <Card title="Email notifications">
      <p className="mb-3 text-sm text-gray-500">Get important updates by email: reservations, move-out requests, new bills and reminders, payments, verification results, and account warnings. Everything else stays in-app. Confirm your inbox once to start. Every email has an unsubscribe link.</p>
      <ErrorBanner message={error} /><SuccessBanner message={message} />
      {step === 'idle' && <div className="space-y-3">
        <p className="text-sm text-gray-600">{enabled ? 'Email notifications are on.' : 'Email notifications are off.'}</p>
        {!user?.emailAccountFlowsAvailable && !confirmed
          ? <p className="text-sm text-gray-500">Email confirmation is currently unavailable.</p>
          : <Button variant="secondary" loading={busy} onClick={confirmed ? toggle : () => { setStep('password'); setMessage(''); }}>
            {enabled ? 'Turn off email notifications' : 'Enable email notifications'}
          </Button>}
      </div>}
      {step === 'password' && <form onSubmit={requestCode} className="space-y-3" noValidate>
        <Field required label="Password to confirm your inbox"><PasswordInput value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></Field>
        <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy} disabled={!password || cooldown > 0}>Send confirmation code</Button><Button variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button></div>
      </form>}
      {step === 'code' && <form onSubmit={finish} className="space-y-3" noValidate>
        <Field required label="Inbox confirmation code"><TextInput inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} /></Field>
        <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy} disabled={code.length !== 6}>Confirm and enable</Button>
          <Button variant="secondary" onClick={requestCode} disabled={busy || cooldown > 0}>{cooldown ? `Resend in ${cooldown}s` : 'Resend confirmation code'}</Button>
          <Button variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button></div>
      </form>}
    </Card>
  );
}
