import { useState } from 'react';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import Button from './ui/Button.jsx';
import { formatDateTime } from '../utils/format.js';

/**
 * Landlord: shows a caretaker's one-time activation code once, with a copy button and its expiry.
 * The code comes from the invite or "New activation code" response and lives only in the
 * parent's state until this dialog closes.
 */
export default function ActivationCodeDialog({ caretaker, code, expiresAt, onClose }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError('Could not copy. Select the code and copy it.');
    }
  };

  return (
    <ConfirmDialog
      open
      title={`Activation code for ${caretaker.fullName || caretaker.email}`}
      message="Give this code to them in person or in a private message. It is shown only once."
      confirmLabel="Done"
      cancelLabel="Close"
      error={error}
      onConfirm={onClose}
      onCancel={onClose}
    >
      <div className="mt-3 space-y-3">
        <p className="rounded-lg border border-gray-200 bg-gray-50 py-3 text-center font-mono text-2xl font-bold tracking-[0.2em] text-gray-900" data-testid="activation-code">
          {code}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-600">Expires {formatDateTime(expiresAt)}.</p>
          <Button type="button" variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy code'}</Button>
        </div>
        <p className="text-xs text-gray-500">
          They open “Activate a caretaker account” on the sign-in page and enter {caretaker.email}, this code and a new password. It works once.
          If it expires or gets lost, use “New activation code”: the old code then stops working.
        </p>
      </div>
    </ConfirmDialog>
  );
}
