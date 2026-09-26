import { useEffect, useState } from 'react';
import { BanknotesIcon, DocumentTextIcon, ExclamationTriangleIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import StatTile from '../../components/charts/StatTile.jsx';
import BillingApi from '../../services/BillingApi.js';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge } from '../../components/ui/Feedback.jsx';
import { formatDate, formatPeriod, formatPeso } from '../../utils/format.js';

const STATUS_TONE = { UNPAID: 'yellow', PARTIAL: 'blue', PAID: 'green', OVERDUE: 'red' };
const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'UNPAID', label: 'Unpaid' },
  { key: 'PARTIAL', label: 'Partial' },
  { key: 'PAID', label: 'Paid' },
];

/** "Juan Cruz" + "Sunrise · Room 101" — who and where a statement belongs to (names come from the API when available). */
function Who({ soa }) {
  return (
    <>
      <span className="block font-medium text-gray-900">{soa.tenantName || 'Tenant'}</span>
      {(soa.propertyName || soa.roomNumber) && (
        <span className="block text-xs text-gray-500">
          {[soa.propertyName, soa.roomNumber && `Room ${soa.roomNumber}`].filter(Boolean).join(' · ')}
        </span>
      )}
    </>
  );
}

export default function BillingPage() {
  const [soas, setSoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    BillingApi.list()
      .then(({ soas: list }) => setSoas(list))
      .catch(() => setError('Could not load statements.'))
      .finally(() => setLoading(false));
  }, []);

  const totals = soas.reduce(
    (acc, s) => ({
      billed: acc.billed + s.totalAmountDue,
      collected: acc.collected + s.amountPaid,
      outstanding: acc.outstanding + s.remainingBalance,
      overdue: acc.overdue + (s.paymentStatus === 'OVERDUE' ? 1 : 0),
    }),
    { billed: 0, collected: 0, outstanding: 0, overdue: 0 }
  );
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, f.key === 'ALL' ? soas.length : soas.filter((s) => s.paymentStatus === f.key).length]));
  const visible = filter === 'ALL' ? soas : soas.filter((s) => s.paymentStatus === filter);

  return (
    <DashboardLayout>
      <PageHeader title="Billing overview" description="Statements of account across all your properties." />
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading statements…" />}
      {!loading && soas.length === 0 && !error && (
        <EmptyState icon={DocumentTextIcon} title="No statements yet" description="Statements are generated when a caretaker logs a room's monthly utility reading." />
      )}
      {!loading && soas.length > 0 && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
            <StatTile icon={ReceiptPercentIcon} label="Total billed" value={formatPeso(totals.billed)} sublabel={`${soas.length} statements`} />
            <StatTile icon={BanknotesIcon} label="Collected" value={formatPeso(totals.collected)} />
            <StatTile icon={DocumentTextIcon} label="Outstanding" value={formatPeso(totals.outstanding)} tone={totals.outstanding > 0 ? 'critical' : 'good'} />
            <StatTile icon={ExclamationTriangleIcon} label="Overdue statements" value={totals.overdue} tone={totals.overdue > 0 ? 'critical' : 'default'} />
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter statements by status">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={filter === f.key}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  filter === f.key ? 'border-brand-600 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {f.label} <span className={filter === f.key ? 'text-brand-100' : 'text-gray-500'}>{counts[f.key]}</span>
              </button>
            ))}
          </div>

          {visible.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 bg-white py-10 text-center text-sm text-gray-500">No statements with this status.</p>}

          {visible.length > 0 && (
            <>
              {/* Desktop/tablet: a table that's easy to scan across. */}
              <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">Tenant</th>
                      <th scope="col" className="px-4 py-3">Period</th>
                      <th scope="col" className="px-4 py-3">Due</th>
                      <th scope="col" className="px-4 py-3 text-right">Total due</th>
                      <th scope="col" className="px-4 py-3 text-right">Paid</th>
                      <th scope="col" className="px-4 py-3 text-right">Balance</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visible.map((s) => (
                      <tr key={s._id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3">
                          <Who soa={s} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-700">{formatPeriod(s.billingPeriod)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500">{formatDate(s.dueDate)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPeso(s.totalAmountDue)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatPeso(s.amountPaid)}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{formatPeso(s.remainingBalance)}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={s.paymentStatus} tones={STATUS_TONE} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Phones: the same information as stacked cards, so nothing scrolls sideways. */}
              <ul className="space-y-3 md:hidden">
                {visible.map((s) => (
                  <li key={s._id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0 text-sm">
                        <Who soa={s} />
                      </div>
                      <StatusBadge status={s.paymentStatus} tones={STATUS_TONE} />
                    </div>
                    <p className="mb-3 text-xs text-gray-500">
                      {formatPeriod(s.billingPeriod)} · due {formatDate(s.dueDate)}
                    </p>
                    <dl className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <dt className="text-gray-500">Total</dt>
                        <dd className="font-medium tabular-nums text-gray-900">{formatPeso(s.totalAmountDue)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Paid</dt>
                        <dd className="font-medium tabular-nums text-gray-900">{formatPeso(s.amountPaid)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-500">Balance</dt>
                        <dd className="font-semibold tabular-nums text-gray-900">{formatPeso(s.remainingBalance)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
