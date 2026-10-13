import { useEffect, useState } from 'react';
import AdminApi from '../services/AdminApi.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import { Badge, ErrorBanner, LoadingState, SuccessBanner } from './ui/Feedback.jsx';
import { describeApiError } from '../utils/errors.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const formatDate = (iso) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

function daysLeft(iso, now) {
  const days = Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS);
  if (days <= 0) return 'Deletes at the next daily run';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/**
 * Admin Archive: accounts moved here are blocked and erased after 30 days. Any admin can restore
 * (admin accounts: main admin only); only the main admin can delete one early.
 */
export default function ArchivedAccounts({ me, roleFilter, query }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = () => {
    setLoading(true);
    AdminApi.listUsers({ accountStatus: 'pending_deletion', ...(roleFilter ? { role: roleFilter } : {}) })
      .then(({ users: list }) => { setUsers(list); setError(''); })
      .catch(() => setError('Could not load the archive.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [roleFilter]);

  const restore = async (u) => {
    setBusyId(u._id);
    setError('');
    setSuccess('');
    try {
      await AdminApi.restoreUser(u._id);
      setSuccess(`${u.fullName} has been restored.`);
      load();
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    setDialogBusy(true);
    setDialogError('');
    try {
      await AdminApi.deleteUser(deleting._id);
      setSuccess(`${deleting.fullName}'s account has been permanently deleted.`);
      setDeleting(null);
      load();
    } catch (err) {
      setDialogError(describeApiError(err).message);
    } finally {
      setDialogBusy(false);
    }
  };

  const now = new Date();
  const q = query.trim().toLowerCase();
  const visible = users.filter((u) => !q || u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));

  return (
    <>
      <p className="mb-3 text-sm text-gray-600">
        Archived accounts are signed out and blocked. They are deleted automatically 30 days after being archived; until then, any admin can restore them. Deleting erases the person&apos;s details but keeps their bills, payments and reservations as &ldquo;Deleted user&rdquo;.
      </p>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      {loading && <LoadingState label="Loading archive…" />}
      {!loading && visible.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">The archive is empty.</p>}
      <div className="mt-2 space-y-2">
        {visible.map((u) => (
          <Card key={u._id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">
                  {u.fullName} <span className="ml-1 text-xs font-normal capitalize text-gray-500">({u.role})</span>
                </p>
                <p className="break-all text-sm text-gray-500">{u.email}</p>
                {u.statusReason && <p className="mt-1 text-xs text-gray-500">Reason: {u.statusReason}</p>}
                {u.deletion?.scheduledFor && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {u.deletion.requestedAt && <span>Archived {formatDate(u.deletion.requestedAt)}</span>}
                    <span>· Deletes on {formatDate(u.deletion.scheduledFor)}</span>
                    <Badge tone="yellow">{daysLeft(u.deletion.scheduledFor, now)}</Badge>
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(u.role !== 'admin' || me?.isMainAdmin) && (
                  <Button variant="secondary" loading={busyId === u._id} onClick={() => restore(u)}>
                    Restore
                  </Button>
                )}
                {me?.isMainAdmin && (
                  <Button variant="danger" onClick={() => { setDialogError(''); setSuccess(''); setDeleting(u); }}>
                    Delete now
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {deleting && (
        <ConfirmDialog
          open
          tone="danger"
          title={`Permanently delete ${deleting.fullName}?`}
          message="This can't be undone. Their name, email, phone, photo, documents and sign-in details are erased now instead of in 30 days. Their bills, payments and reservations stay, shown as “Deleted user”."
          confirmLabel="Delete permanently"
          loading={dialogBusy}
          error={dialogError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}
