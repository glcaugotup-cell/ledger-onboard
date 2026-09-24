import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import AdminApi from '../../services/AdminApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { Badge, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

const STATUS_TONE = { active: 'green', pending_activation: 'yellow', suspended: 'red', deactivated: 'gray', archived: 'gray' };

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    setLoading(true);
    AdminApi.listUsers(roleFilter ? { role: roleFilter } : {})
      .then(({ users: list }) => setUsers(list))
      .catch(() => setError('Could not load users.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [roleFilter]);

  const setStatus = async (id, status) => {
    const reason = status !== 'active' ? prompt(`Reason for setting status to ${status}?`) || undefined : undefined;
    setBusyId(id);
    try {
      await AdminApi.setUserStatus(id, { status, reason });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Users</h1>
        <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="w-48">
          <option value="">All roles</option>
          {['tenant', 'landlord', 'caretaker', 'admin'].map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </Select>
      </div>
      <ErrorBanner message={error} />
      {loading && <LoadingState />}
      <div className="space-y-2">
        {users.map((u) => (
          <Card key={u._id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-gray-900">
                  {u.fullName} <span className="ml-1 text-xs font-normal capitalize text-gray-400">({u.role})</span>
                </p>
                <p className="text-sm text-gray-500">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[u.accountStatus]}>{u.accountStatus.replace('_', ' ')}</Badge>
                {u.role !== 'admin' && (
                  <>
                    {u.accountStatus !== 'active' && (
                      <Button variant="secondary" loading={busyId === u._id} onClick={() => setStatus(u._id, 'active')}>
                        Activate
                      </Button>
                    )}
                    {u.accountStatus !== 'suspended' && (
                      <Button variant="danger" loading={busyId === u._id} onClick={() => setStatus(u._id, 'suspended')}>
                        Suspend
                      </Button>
                    )}
                    {u.accountStatus !== 'deactivated' && (
                      <Button variant="ghost" loading={busyId === u._id} onClick={() => setStatus(u._id, 'deactivated')}>
                        Deactivate
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
