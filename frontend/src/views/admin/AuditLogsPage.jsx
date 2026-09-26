import { useEffect, useState } from 'react';
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import AdminApi from '../../services/AdminApi.js';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';
import { formatDateTime, formatStatus } from '../../utils/format.js';

/** "ACCOUNT_STATUS_SET_SUSPENDED" -> "Account status set suspended", with the raw code kept for searching and support. */
function ActionLabel({ action }) {
  return (
    <>
      <span className="block font-medium text-gray-900">{formatStatus(action)}</span>
      <span className="block font-mono text-[11px] text-gray-500">{action}</span>
    </>
  );
}

function Result({ success }) {
  return success ? <Badge tone="green">Success</Badge> : <Badge tone="red">Failed</Badge>;
}

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
      <PageHeader title="Audit logs" description="A record of important account, reservation and payment actions, newest first." />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading audit logs…" />}
      {!loading && logs.length === 0 && !error && <EmptyState icon={ClipboardDocumentListIcon} title="No audit entries yet" />}
      {!loading && logs.length > 0 && (
        <>
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-4 py-3">When</th>
                  <th scope="col" className="px-4 py-3">Action</th>
                  <th scope="col" className="px-4 py-3">Actor role</th>
                  <th scope="col" className="px-4 py-3">Target</th>
                  <th scope="col" className="px-4 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((l) => (
                  <tr key={l._id} className="hover:bg-gray-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDateTime(l.createdAt)}</td>
                    <td className="px-4 py-3">
                      <ActionLabel action={l.action} />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{l.actorRole ? formatStatus(l.actorRole) : 'System'}</td>
                    <td className="px-4 py-3 text-gray-600">{l.targetType || '—'}</td>
                    <td className="px-4 py-3">
                      <Result success={l.success} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {logs.map((l) => (
              <li key={l._id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm">
                    <ActionLabel action={l.action} />
                  </div>
                  <Result success={l.success} />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  {formatDateTime(l.createdAt)} · {l.actorRole ? formatStatus(l.actorRole) : 'System'}
                  {l.targetType ? ` · ${l.targetType}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardLayout>
  );
}
