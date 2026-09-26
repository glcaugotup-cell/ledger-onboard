import { useEffect, useState } from 'react';
import { isServerSlow, onServerSlowChange } from '../services/apiClient.js';
import { Spinner } from './ui/Feedback.jsx';

/**
 * Shown while any request has been waiting a few seconds, which on the free
 * Render plan usually means the backend is waking up from sleep.
 */
export default function ServerWakeNotice() {
  const [slow, setSlow] = useState(isServerSlow);

  useEffect(() => onServerSlowChange(setSlow), []);

  if (!slow) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 shadow-lg"
    >
      <Spinner className="h-5 w-5 shrink-0" />
      <p>Waking up the server… The first request after a quiet period can take up to a minute. Please keep this page open.</p>
    </div>
  );
}
