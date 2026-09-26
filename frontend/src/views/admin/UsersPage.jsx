import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import AdminApi from '../../services/AdminApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ReasonDialog from '../../components/ReasonDialog.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { Badge, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { INACTIVITY_DEACTIVATION_DAYS, formatLastActive, isEligibleForInactivityDeactivation } from '../../utils/activity.js';

const STATUS_TONE = { active: 'green', pending_activation: 'yellow', suspended: 'red', deactivated: 'gray', archived: 'gray' };

const SUSPENSION_REASONS = ['Policy violation', 'Suspicious activity', 'Incomplete/invalid information', 'Repeated rule violations', 'Administrative review'];
const DEACTIVATION_REASONS = ['Policy violation', 'Suspicious activity', 'Incomplete/invalid information', 'Duplicate account', 'Administrative review'];
const INACTIVITY_REASONS = [`No activity for over ${INACTIVITY_DEACTIVATION_DAYS} days`, 'Account appears abandoned', 'Duplicate account', 'Owner asked for the account to be closed'];

/** Dialog settings per admin action; every one needs a reason and an explicit confirmation. */
const ACTIONS = {
  suspend: {
    title: (u) => `Suspend ${u.fullName}?`,
    message: 'They will be signed out and blocked from signing in until an admin reactivates the account. Nothing is deleted.',
    reasons: SUSPENSION_REASONS,
    confirmLabel: 'Suspend account',
    done: (u) => `${u.fullName} has been suspended.`,
  },
  deactivate: {
    title: (u) => `Deactivate ${u.fullName}?`,
    message: 'They will be signed out and blocked from signing in until an admin reactivates the account. Their history is kept.',
    reasons: DEACTIVATION_REASONS,
    confirmLabel: 'Deactivate account',
    done: (u) => `${u.fullName} has been deactivated.`,
  },
  inactive: {
    title: (u) => `Deactivate ${u.fullName} for inactivity?`,
    message: (u) =>
      `${formatLastActive(u)} — over ${INACTIVITY_DEACTIVATION_DAYS} days without activity. This is separate from the automatic 30-day archive: a deactivated account can't use self-service recovery and must be reactivated by an admin. Their reservations, bills, payments, reviews and records stay intact.`,
    reasons: INACTIVITY_REASONS,
    confirmLabel: 'Deactivate account',
    done: (u) => `${u.fullName} has been deactivated for inactivity.`,
  },
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [inactiveOnly, setInactiveOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busyId, setBusyId] = useState(null);
  // { action: 'suspend' | 'deactivate' | 'inactive', user }
  const [pending, setPending] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);

  const load = () => {
    setLoading(true);
    AdminApi.listUsers(roleFilter ? { role: roleFilter } : {})
      .then(({ users: list }) => {
        setUsers(list);
        setError('');
      })
      .catch(() => setError('Could not load users.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [roleFilter]);

  const reactivate = async (u) => {
    setBusyId(u._id);
    setError('');
    setSuccess('');
    try {
      await AdminApi.setUserStatus(u._id, { status: 'active' });
      setSuccess(`${u.fullName} has been reactivated.`);
      load();
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  const openDialog = (action, user) => {
    setDialogError('');
    setSuccess('');
    setPending({ action, user });
  };

  // Called only from the dialog's confirm button, with the chosen reason(s).
  const confirmAction = async (reason) => {
    const { action, user } = pending;
    setDialogBusy(true);
    setDialogError('');
    try {
      if (action === 'inactive') await AdminApi.deactivateInactive(user._id, reason);
      else await AdminApi.setUserStatus(user._id, { status: action === 'suspend' ? 'suspended' : 'deactivated', reason });
      setSuccess(ACTIONS[action].done(user));
      setPending(null);
      load();
    } catch (err) {
      setDialogError(describeApiError(err).message);
    } finally {
      setDialogBusy(false);
    }
  };

  const now = new Date();
  const visible = inactiveOnly ? users.filter((u) => isEligibleForInactivityDeactivation(u, now)) : users;
  const config = pending && ACTIONS[pending.action];

  return (
    <DashboardLayout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Users</h1>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={inactiveOnly}
              onChange={(e) => setInactiveOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
            />
            Inactive {INACTIVITY_DEACTIVATION_DAYS}+ days only
          </label>
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-48" aria-label="Filter by role">
            <option value="">All roles</option>
            {['tenant', 'landlord', 'caretaker', 'admin'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      {loading && <LoadingState />}
      {!loading && visible.length === 0 && <p className="py-8 text-center text-sm text-gray-400">No users match these filters.</p>}
      <div className="mt-2 space-y-2">
        {visible.map((u) => {
          const activity = formatLastActive(u, now);
          const inactiveLong = isEligibleForInactivityDeactivation(u, now);
          return (
            <Card key={u._id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {u.fullName} <span className="ml-1 text-xs font-normal capitalize text-gray-400">({u.role})</span>
                  </p>
                  <p className="break-all text-sm text-gray-500">{u.email}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span className="inline-flex items-center gap-1" title={u.lastActivityAt ? new Date(u.lastActivityAt).toLocaleString() : undefined}>
                      <span className={`h-2 w-2 rounded-full ${activity === 'Active now' ? 'bg-green-500' : 'bg-gray-300'}`} aria-hidden="true" />
                      {activity}
                    </span>
                    {inactiveLong && <Badge tone="yellow">Inactive {INACTIVITY_DEACTIVATION_DAYS}+ days</Badge>}
                  </p>
                  {u.statusReason && u.accountStatus !== 'active' && <p className="mt-1 text-xs text-gray-500">Reason: {u.statusReason}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS_TONE[u.accountStatus]}>{u.accountStatus.replace('_', ' ')}</Badge>
                  {u.role !== 'admin' && (
                    <>
                      {u.accountStatus !== 'active' && (
                        <Button variant="secondary" loading={busyId === u._id} onClick={() => reactivate(u)}>
                          Activate
                        </Button>
                      )}
                      {u.accountStatus !== 'suspended' && (
                        <Button variant="danger" onClick={() => openDialog('suspend', u)}>
                          Suspend
                        </Button>
                      )}
                      {inactiveLong ? (
                        <Button variant="ghost" onClick={() => openDialog('inactive', u)}>
                          Deactivate (inactive)
                        </Button>
                      ) : (
                        u.accountStatus !== 'deactivated' && (
                          <Button variant="ghost" onClick={() => openDialog('deactivate', u)}>
                            Deactivate
                          </Button>
                        )
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {pending && (
        <ReasonDialog
          key={`${pending.action}-${pending.user._id}`}
          open
          title={config.title(pending.user)}
          message={typeof config.message === 'function' ? config.message(pending.user) : config.message}
          reasons={config.reasons}
          confirmLabel={config.confirmLabel}
          loading={dialogBusy}
          error={dialogError}
          onConfirm={confirmAction}
          onCancel={() => setPending(null)}
        />
      )}
    </DashboardLayout>
  );
}
