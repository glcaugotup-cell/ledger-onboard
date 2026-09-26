import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import BillingApi from '../../services/BillingApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { BanknotesIcon, CalendarDaysIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import StatTile from '../../components/charts/StatTile.jsx';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { formatDate, formatPeriod, formatPeso } from '../../utils/format.js';
import { describeApiError } from '../../utils/errors.js';
import { validateImageFile, validatePaymentAmount } from '../../utils/validators.js';

const STATUS_TONE = { UNPAID: 'yellow', PARTIAL: 'blue', PAID: 'green', OVERDUE: 'red' };

function PaySoaForm({ soa, onDone }) {
  const [amount, setAmount] = useState(String(soa.remainingBalance));
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const errors = {
      amount: validatePaymentAmount(amount, soa.remainingBalance),
      file: validateImageFile(file, { label: 'a screenshot of your GCash payment' }),
    };
    setFieldErrors(errors);
    if (errors.amount || errors.file) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('soaId', soa._id);
      formData.append('amount', amount);
      formData.append('paymentMethod', 'GCASH_SCREENSHOT');
      formData.append('proofImage', file);
      await PaymentApi.submit(formData);
      onDone();
    } catch (err) {
      const { message, fieldErrors: serverErrors } = describeApiError(err);
      setError(message || 'Could not submit payment.');
      setFieldErrors({ amount: serverErrors.amount });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <ErrorBanner message={error} />
      <Field label="Amount (₱)" error={fieldErrors.amount}>
        <TextInput
          type="number"
          min="0.01"
          max={soa.remainingBalance}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={fieldErrors.amount}
        />
      </Field>
      <Field label="GCash screenshot" error={fieldErrors.file}>
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files[0] || null)} className="block text-sm" />
      </Field>
      <Button type="submit" loading={loading} className="w-full">
        Submit proof of payment
      </Button>
    </form>
  );
}

export default function MyBillingPage() {
  const [soas, setSoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingId, setPayingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  const load = () => {
    setLoading(true);
    BillingApi.list()
      .then(({ soas: list }) => setSoas(list))
      .catch(() => setError('Could not load your billing statements.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const open = soas.filter((s) => s.remainingBalance > 0 && s.paymentStatus !== 'PAID');
  const outstanding = open.reduce((sum, s) => sum + s.remainingBalance, 0);
  const nextDue = [...open].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

  return (
    <DashboardLayout>
      <PageHeader title="Billing & statements" description="Your monthly statements of account and payments." />
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <SuccessBanner message={successMsg} />
      </div>
      {loading && <LoadingState label="Loading your statements…" />}
      {!loading && soas.length === 0 && (
        <EmptyState icon={DocumentTextIcon} title="No statements yet" description="Your monthly statement of account appears here once a caretaker logs a utility reading." />
      )}
      {!loading && soas.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          <div className="col-span-2 sm:col-span-1">
            <StatTile
              icon={BanknotesIcon}
              label="Total balance"
              value={formatPeso(outstanding)}
              tone={outstanding > 0 ? 'critical' : 'good'}
              sublabel={open.length ? `across ${open.length} statement${open.length === 1 ? '' : 's'}` : 'Everything is paid'}
            />
          </div>
          <StatTile
            icon={CalendarDaysIcon}
            label="Next due"
            value={nextDue ? formatDate(nextDue.dueDate) : '—'}
            sublabel={nextDue ? `${formatPeriod(nextDue.billingPeriod)} statement` : 'No upcoming bills'}
          />
          <StatTile icon={DocumentTextIcon} label="Statements" value={soas.length} sublabel="since you moved in" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {soas.map((soa) => {
          const owed = soa.remainingBalance > 0 && soa.paymentStatus !== 'PAID';
          return (
            <Card key={soa._id} className={soa.paymentStatus === 'OVERDUE' ? 'border-red-200' : ''}>
              <article aria-label={`${formatPeriod(soa.billingPeriod)} statement`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{formatPeriod(soa.billingPeriod)}</p>
                    {(soa.propertyName || soa.roomNumber) && (
                      <p className="text-xs text-gray-500">{[soa.propertyName, soa.roomNumber && `Room ${soa.roomNumber}`].filter(Boolean).join(' · ')}</p>
                    )}
                  </div>
                  <StatusBadge status={soa.paymentStatus} tones={STATUS_TONE} />
                </div>
                <div className="mb-3 flex items-end justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
                  <div>
                    <p className="text-xs text-gray-500">Remaining balance</p>
                    <p className={`text-xl font-bold tabular-nums ${owed ? 'text-gray-900' : 'text-green-700'}`}>{formatPeso(soa.remainingBalance)}</p>
                  </div>
                  <p className={`text-right text-xs ${soa.paymentStatus === 'OVERDUE' ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                    Due {formatDate(soa.dueDate)}
                  </p>
                </div>
                <dl className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between"><dt>Base rent</dt><dd className="tabular-nums">{formatPeso(soa.baseRent)}</dd></div>
                  <div className="flex justify-between"><dt>Electric share</dt><dd className="tabular-nums">{formatPeso(soa.electricShare)}</dd></div>
                  <div className="flex justify-between"><dt>Water share</dt><dd className="tabular-nums">{formatPeso(soa.waterShare)}</dd></div>
                  <div className="flex justify-between"><dt>Previous arrears</dt><dd className="tabular-nums">{formatPeso(soa.previousArrears)}</dd></div>
                  <div className="flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-900"><dt>Total due</dt><dd className="tabular-nums">{formatPeso(soa.totalAmountDue)}</dd></div>
                  <div className="flex justify-between"><dt>Amount paid</dt><dd className="tabular-nums">{formatPeso(soa.amountPaid)}</dd></div>
                </dl>

                {owed && (
                  <>
                    {payingId === soa._id ? (
                      <PaySoaForm
                        soa={soa}
                        onDone={() => {
                          setPayingId(null);
                          setSuccessMsg('Payment proof submitted — awaiting verification.');
                          load();
                        }}
                      />
                    ) : (
                      <Button className="mt-4 w-full" onClick={() => setPayingId(soa._id)}>
                        Pay via GCash
                      </Button>
                    )}
                  </>
                )}
              </article>
            </Card>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
