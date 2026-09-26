import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import AdminApi from '../../services/AdminApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import ReasonDialog from '../../components/ReasonDialog.jsx';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import PageHeader from '../../components/layout/PageHeader.jsx';
import { Select, TextInput } from '../../components/ui/Field.jsx';
import { formatStatus } from '../../utils/format.js';
import { Badge, ErrorBanner, LoadingState, StatusBadge, SuccessBanner } from '../../components/ui/Feedback.jsx';
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
  const [query, setQuery] = useState('');
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
  const q = query.trim().toLowerCase();
  const visible = users
    .filter((u) => !inactiveOnly || isEligibleForInactivityDeactivation(u, now))
    .filter((u) => !q || u.fullName?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  const config = pending && ACTIONS[pending.action];

  return (
    <DashboardLayout>
      <PageHeader title="Users" description="Every account on the platform, its status and when it was last active." />
      <div className="mb-5 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <TextInput type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" aria-label="Search users" className="pl-9" />
        </div>
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
          <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="sm:w-44" aria-label="Filter by role">
            <option value="">All roles</option>
            {['tenant', 'landlord', 'caretaker', 'admin'].map((r) => (
              <option key={r} value={r}>
                {formatStatus(r)}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ErrorBanner message={error} />
      <SuccessBanner message={success} />
      {loading && <LoadingState label="Loading users…" />}
      {!loading && visible.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">No users match these filters.</p>}
      <div className="mt-2 space-y-2">
        {visible.map((u) => {
          const activity = formatLastActive(u, now);
          const inactiveLong = isEligibleForInactivityDeactivation(u, now);
          return (
            <Card key={u._id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {u.fullName} <span className="ml-1 text-xs font-normal capitalize text-gray-500">({u.role})</span>
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
                  <StatusBadge status={u.accountStatus} tones={STATUS_TONE} />
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
