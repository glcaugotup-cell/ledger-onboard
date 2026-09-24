import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import BillingApi from '../../services/BillingApi.js';
import { Badge, EmptyState, ErrorBanner, LoadingState } from '../../components/ui/Feedback.jsx';

const STATUS_TONE = { UNPAID: 'yellow', PARTIAL: 'blue', PAID: 'green', OVERDUE: 'red' };

export default function BillingPage() {
  const [soas, setSoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    BillingApi.list()
      .then(({ soas: list }) => setSoas(list))
      .catch(() => setError('Could not load statements.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Billing overview</h1>
      <ErrorBanner message={error} />
      {loading && <LoadingState />}
      {!loading && soas.length === 0 && <EmptyState title="No statements yet" />}
      {!loading && soas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Total due</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Balance</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {soas.map((s) => (
                <tr key={s._id}>
                  <td className="px-4 py-3">{new Date(s.billingPeriod).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</td>
                  <td className="px-4 py-3 tabular-nums">₱{s.totalAmountDue.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">₱{s.amountPaid.toLocaleString()}</td>
                  <td className="px-4 py-3 tabular-nums">₱{s.remainingBalance.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[s.paymentStatus]}>{s.paymentStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
