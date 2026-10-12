import { useEffect, useState } from 'react';
import Button from './ui/Button.jsx';
import { ErrorBanner, SuccessBanner } from './ui/Feedback.jsx';
import { describeApiError } from '../utils/errors.js';

/** Shared resend feedback; server cooldowns and attempt limits remain authoritative. */
export default function EmailCodeRequestButton({ request, initialCooldown = 0, disabled = false, label = 'Send email code' }) {
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);
  async function send() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request();
      setCooldown(result?.resendAfterSeconds || 45);
      setMessage(result?.message || 'Check your email for a verification code.');
    } catch (err) {
      const info = describeApiError(err);
      setError(info.message);
      if (info.details?.retryAfterSeconds) setCooldown(info.details.retryAfterSeconds);
    } finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <ErrorBanner message={error} /><SuccessBanner message={message} />
    <Button type="button" variant="ghost" loading={busy} disabled={disabled || cooldown > 0} onClick={send}>
      {cooldown ? `Resend email code in ${cooldown} seconds` : label}
    </Button>
  </div>;
}
