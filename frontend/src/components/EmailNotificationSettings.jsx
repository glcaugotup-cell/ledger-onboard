import { useEffect, useState } from 'react';
import AuthApi from '../services/AuthApi.js';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import PasswordInput from './ui/PasswordInput.jsx';
import { Field, TextInput } from './ui/Field.jsx';
import { ErrorBanner, SuccessBanner } from './ui/Feedback.jsx';
import { describeApiError } from '../utils/errors.js';

// Same keys as backend/utils/emailCategories.js; labels differ by role where the emails do.
const CATEGORY_TEXT = {
  reservations: {
    tenant: ['Reservations and move-outs', 'Approvals, rejections, cancellations and move-out decisions'],
    landlord: ['Reservation requests and move-outs', 'New requests, cancellations, no-shows and move-out requests'],
  },
  bills: { tenant: ['Bills and due-date reminders', 'New bills, and reminders 7 and 3 days before they are due'] },
  payments: {
    tenant: ['Payment results', 'When your payment is verified or rejected'],
    landlord: ['Payments received', 'When a tenant submits a payment for you to check'],
  },
  verification: { landlord: ['Business verification results', 'When your business documents are approved or rejected'] },
  assignments: { caretaker: ['Property assignments', 'When a landlord assigns you to a property'] },
  account: {
    any: ['Account warnings', 'A warning before an inactive account is archived, and the archive notice'],
  },
};
const ROLE_CATEGORIES = {
  tenant: ['reservations', 'bills', 'payments', 'account'],
  landlord: ['reservations', 'payments', 'verification', 'account'],
  caretaker: ['assignments', 'account'],
  admin: [],
};
const textFor = (key, role) => CATEGORY_TEXT[key][role] || CATEGORY_TEXT[key].any;
const savedChoices = (user) => Object.fromEntries((ROLE_CATEGORIES[user?.role] || [])
  .map((key) => [key, user?.notificationPreferences?.emailCategories?.[key] !== false]));

export default function EmailNotificationSettings({ user, onChanged }) {
  const [step, setStep] = useState('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [choices, setChoices] = useState(() => savedChoices(user));
  const categories = ROLE_CATEGORIES[user?.role] || [];
  const changed = categories.some((key) => choices[key] !== savedChoices(user)[key]);
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
  const saveChoices = () => run(async () => {
    await AuthApi.updateMe({ notificationPreferences: { emailCategories: choices } });
    await onChanged?.(); setMessage('Email preferences saved.');
  });
  const toggle = () => run(async () => {
    await AuthApi.updateMe({ notificationPreferences: { email: !enabled } });
    await onChanged?.(); setMessage(enabled ? 'Email notifications are off.' : 'Email notifications are enabled.');
  });
  return (
    <Card title="Email notifications">
      <p className="mb-3 text-sm text-gray-500">{categories.length ? 'Choose which updates also arrive by email. In-app notifications stay on, and security emails (password changes, two-factor turned off) always send.' : 'Admin accounts only get security emails, such as a password change.'} Confirm your inbox once to start. Every email has an unsubscribe link.</p>
      <ErrorBanner message={error} /><SuccessBanner message={message} />
      {step === 'idle' && <div className="space-y-3">
        <p className="text-sm text-gray-600">{enabled ? 'Email notifications are on.' : 'Email notifications are off.'}</p>
        {!user?.emailAccountFlowsAvailable && !confirmed
          ? <p className="text-sm text-gray-500">Email confirmation is currently unavailable.</p>
          : <Button variant="secondary" loading={busy} onClick={confirmed ? toggle : () => { setStep('password'); setMessage(''); }}>
            {enabled ? 'Turn off email notifications' : 'Enable email notifications'}
          </Button>}
        {enabled && categories.length > 0 && <fieldset className="space-y-1 border-t border-gray-100 pt-3">
          <legend className="mb-1 text-sm font-medium text-gray-700">Email me about</legend>
          {categories.map((key) => {
            const [label, hint] = textFor(key, user.role);
            return (
              <label key={key} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-2 py-2 hover:bg-gray-50">
                <span className="min-w-0"><span className="block text-sm text-gray-900">{label}</span><span className="block text-xs text-gray-500">{hint}</span></span>
                <input type="checkbox" checked={choices[key]} onChange={(e) => setChoices((c) => ({ ...c, [key]: e.target.checked }))} className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-400" />
              </label>
            );
          })}
          <Button className="mt-2" loading={busy} disabled={!changed} onClick={saveChoices}>Save email preferences</Button>
        </fieldset>}
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
