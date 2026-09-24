import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import AdminApi from '../../services/AdminApi.js';
import { EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    AdminApi.listAuditLogs({ limit: 100 })
      .then(({ logs: list }) => setLogs(list))
      .catch(() => setError('Could not load audit logs.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Audit logs</h1>
      <ErrorBanner message={error} />
      {loading && <LoadingState />}
      {!loading && logs.length === 0 && <EmptyState title="No audit entries yet" />}
      {!loading && logs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Actor role</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Success</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((l) => (
                <tr key={l._id}>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">{l.action}</td>
                  <td className="px-4 py-3 capitalize text-gray-500">{l.actorRole || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{l.targetType || '—'}</td>
                  <td className="px-4 py-3">{l.success ? '✓' : '✗'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
