import { useState } from 'react';
import AdminApi from '../services/AdminApi.js';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import { Badge, ErrorBanner } from './ui/Feedback.jsx';
import { describeApiError } from '../utils/errors.js';

const STATUS = {
  accepted: ['green', 'Sent'],
  skipped: ['yellow', 'Not sent: sending is off'],
  failed: ['red', 'Failed'],
};
const yesNo = (value) => (value ? 'Yes' : 'No');

/**
 * Main admin: send a test email to yourself and see on screen whether it went out and, if not,
 * which setting to fix. No secrets are shown, only whether the API key is set.
 */
export default function EmailDeliveryCheck() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await AdminApi.sendTestEmail());
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const [tone, label] = STATUS[result?.status] || [];
  return (
    <Card title="Email delivery check" className="mt-6">
      <p className="mb-3 text-sm text-gray-500">
        Sends a test email to your own address and shows whether it went out. If it didn&apos;t, it tells you which setting to fix on the server, in Brevo or in Google Cloud.
      </p>
      <ErrorBanner message={error} />
      <Button variant="secondary" loading={busy} onClick={run}>Send test email</Button>
      {result && (
        <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm" data-testid="email-check-result">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={tone}>{label}</Badge>
            <span className="text-gray-600">to {result.to}</span>
            {result.status !== 'accepted' && <span className="font-mono text-xs text-gray-500">{result.reason}</span>}
          </p>
          <p className="font-medium text-gray-900">{result.advice}</p>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs text-gray-600">
            <dt>EMAIL_TRANSPORT</dt><dd className="font-mono">{result.transport}</dd>
            {result.transport === 'gmail'
              ? <><dt>Gmail credentials set</dt><dd>{yesNo(result.gmailConfigured)}</dd></>
              : <><dt>BREVO_API_KEY set</dt><dd>{yesNo(result.apiKeyConfigured)}</dd></>}
            <dt>EMAIL_FROM</dt><dd className="break-all font-mono">{result.senderEmail || '—'}{result.senderFormatValid ? '' : ' (not a valid address)'}</dd>
            <dt>Sign-up codes required</dt><dd>{yesNo(result.registrationVerificationRequired)}</dd>
            <dt>Email reset codes and invites</dt><dd>{yesNo(result.accountFlowsEnabled)}</dd>
          </dl>
        </div>
      )}
    </Card>
  );
}
