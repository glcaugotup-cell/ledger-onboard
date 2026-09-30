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
import { validatePaymentAmount } from '../../utils/validators.js';

const STATUS_TONE = { UNPAID: 'yellow', PARTIAL: 'blue', PAID: 'green', OVERDUE: 'red' };

function PaySoaForm({ soa, onDone }) {
  const [amount, setAmount] = useState(String(soa.remainingBalance));
  const [referenceNumber, setReferenceNumber] = useState('');
  const [qrUrl, setQrUrl] = useState('');
  const [qrError, setQrError] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let currentUrl;
    BillingApi.fetchPaymentQrObjectUrl(soa._id)
      .then((url) => { currentUrl = url; setQrUrl(url); })
      .catch(() => setQrError('Your landlord has not uploaded a GCash QR code yet. Please contact them to arrange payment.'));
    return () => { if (currentUrl) URL.revokeObjectURL(currentUrl); };
  }, [soa._id]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const errors = {
      amount: validatePaymentAmount(amount, soa.remainingBalance),
      referenceNumber: referenceNumber.trim().length < 5 ? 'Enter the GCash transaction reference after paying.' : '',
    };
    setFieldErrors(errors);
    if (errors.amount || errors.referenceNumber || !qrUrl) return;
    setLoading(true);
    try {
      await PaymentApi.submitQr({ soaId: soa._id, amount, paymentMethod: 'GCASH_QR', referenceNumber: referenceNumber.trim() });
      onDone();
    } catch (err) {
      const { message, fieldErrors: serverErrors } = describeApiError(err);
      setError(message || 'Could not submit payment.');
      setFieldErrors({ amount: serverErrors.amount, referenceNumber: serverErrors.referenceNumber });
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
          max={Math.min(100000000, soa.remainingBalance)}
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          error={fieldErrors.amount}
        />
      </Field>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="mb-2 text-sm font-medium text-gray-800">Pay your landlord by scanning this GCash QR code</p>
        {qrUrl ? (
          <>
            <img src={qrUrl} alt="Landlord GCash payment QR code" className="mx-auto max-h-64 max-w-full rounded-lg bg-white object-contain" />
            <a href={qrUrl} download="landlord-gcash-qr.png" className="mt-2 inline-block text-sm font-medium text-brand-700 underline">Save QR code to scan in GCash</a>
          </>
        ) : <p className="text-sm text-gray-600">{qrError || 'Loading landlord QR code…'}</p>}
        <p className="mt-2 text-xs text-gray-500">Scan with GCash, complete the transfer, then enter the transaction reference shown in your receipt.</p>
      </div>
      <Field label="GCash transaction reference" error={fieldErrors.referenceNumber}>
        <TextInput value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} maxLength={100} placeholder="Enter the reference from your GCash receipt" error={fieldErrors.referenceNumber} />
      </Field>
      <Button type="submit" loading={loading} disabled={!qrUrl} className="w-full">
        Submit payment for verification
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

  useEffect(() => {
    load();
    // Keep receipt verification and statement balances current while the page is open.
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const open = soas.filter((s) => s.remainingBalance > 0 && s.paymentStatus !== 'PAID');
  const outstanding = open.reduce((sum, s) => sum + s.remainingBalance, 0);
  const nextDue = [...open].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

  return (
    <DashboardLayout>
      <PageHeader title="Billing & statements" description="Monthly rent, utility charges, statements, and payment receipts. Updates sync automatically." />
      <div className="space-y-4">
        <ErrorBanner message={error} />
        <SuccessBanner message={successMsg} />
      </div>
      {loading && <LoadingState label="Loading your statements…" />}
      {!loading && soas.length === 0 && (
        <EmptyState icon={DocumentTextIcon} title="No statements yet" description="Your monthly statement of account appears here once a caretaker logs a utility reading." />
      )}
      {!loading && open.length > 0 && (
        <section className="mb-6" aria-labelledby="balances-to-pay-heading">
          <h2 id="balances-to-pay-heading" className="mb-3 text-lg font-semibold text-gray-900">Balances to pay</h2>
          <div className="space-y-3">
            {open.map((soa) => (
              <Card key={`balance-${soa._id}`} className={soa.paymentStatus === 'OVERDUE' ? 'border-red-200' : ''}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">Balance to pay — {formatPeriod(soa.billingPeriod)}</p>
                    {(soa.propertyName || soa.roomNumber) && <p className="text-sm text-gray-500">{[soa.propertyName, soa.roomNumber && `Room ${soa.roomNumber}`].filter(Boolean).join(' · ')}</p>}
                    <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{formatPeso(soa.remainingBalance)}</p>
                  </div>
                  <Button onClick={() => setPayingId(payingId === soa._id ? null : soa._id)}>
                    {payingId === soa._id ? 'Close payment' : 'Pay now'}
                  </Button>
                </div>
                {payingId === soa._id && (
                  <PaySoaForm
                    soa={soa}
                    onDone={() => {
                      setPayingId(null);
                      setSuccessMsg('GCash payment reference submitted — awaiting verification.');
                      load();
                    }}
                  />
                )}
              </Card>
            ))}
          </div>
        </section>
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
                    <p className="text-xs text-gray-500">{['Room Only', 'Bedspace'].includes(soa.propertyType) ? 'Fixed monthly rate' : 'Amount to pay · monthly rent'} {formatPeso(soa.baseRent)}</p>
                    <p className={`text-xl font-bold tabular-nums ${owed ? 'text-gray-900' : 'text-green-700'}`}>{formatPeso(soa.remainingBalance)}</p>
                  </div>
                  <p className={`text-right text-xs ${soa.paymentStatus === 'OVERDUE' ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                    Due {formatDate(soa.dueDate)}
                  </p>
                </div>
                <dl className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between"><dt>Base rent</dt><dd className="tabular-nums">{formatPeso(soa.baseRent)}</dd></div>
                  {!['Room Only', 'Bedspace'].includes(soa.propertyType) && (
                    <>
                      <div className="flex justify-between"><dt>Electric share</dt><dd className="tabular-nums">{formatPeso(soa.electricShare)}</dd></div>
                      <div className="flex justify-between"><dt>Water share</dt><dd className="tabular-nums">{formatPeso(soa.waterShare)}</dd></div>
                    </>
                  )}
                  <div className="flex justify-between"><dt>Previous arrears</dt><dd className="tabular-nums">{formatPeso(soa.previousArrears)}</dd></div>
                  <div className="flex justify-between border-t border-gray-100 pt-1 font-semibold text-gray-900"><dt>Total due</dt><dd className="tabular-nums">{formatPeso(soa.totalAmountDue)}</dd></div>
                  <div className="flex justify-between"><dt>Amount paid</dt><dd className="tabular-nums">{formatPeso(soa.amountPaid)}</dd></div>
                </dl>

              </article>
            </Card>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
