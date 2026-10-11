import { useState } from 'react';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import Button from './ui/Button.jsx';
import AdminApi from '../services/AdminApi.js';
import { describeApiError } from '../utils/errors.js';

const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Admin: create a one-time password reset code for `user` and show it once.
 * Step 1 asks the admin to confirm the person's identity in person; step 2 shows the code
 * with a copy button and its expiry. The code lives only in this component's state.
 */
export default function ResetCodeDialog({ user, onClose }) {
  const [result, setResult] = useState(null); // { code, expiresAt }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await AdminApi.issueResetCode(user._id));
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the code and copy it.');
    }
  };

  if (!result) {
    return (
      <ConfirmDialog
        open
        title={`Create a password reset code for ${user.fullName}?`}
        message={`Only do this after confirming in person that you are talking to ${user.fullName}. Anyone with the code can set a new password for this account. It works once and expires in 30 minutes.`}
        confirmLabel="Create code"
        loading={busy}
        error={error}
        onConfirm={create}
        onCancel={onClose}
      />
    );
  }

  return (
    <ConfirmDialog
      open
      title={`Reset code for ${user.fullName}`}
      message="Give this code to them in person. It is shown only once."
      confirmLabel="Done"
      cancelLabel="Close"
      error={error}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <div className="mt-3 space-y-3">
        <p className="rounded-lg border border-gray-200 bg-gray-50 py-3 text-center font-mono text-2xl font-bold tracking-[0.2em] text-gray-900" data-testid="reset-code">
          {result.code}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">Expires at {formatTime(result.expiresAt)}.</p>
          <Button type="button" variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</Button>
        </div>
        <p className="text-xs text-gray-500">
          They enter it on the sign-in page under “Forgot password?”, with their email and a new password. Every device they are signed in on will be signed out.
        </p>
      </div>
    </ConfirmDialog>
  );
}
