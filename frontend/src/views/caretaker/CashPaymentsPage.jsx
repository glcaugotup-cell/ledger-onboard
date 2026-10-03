import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PageHeader from '../../components/layout/PageHeader.jsx';
import BillingApi from '../../services/BillingApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import PaymentVerificationList from '../../components/PaymentVerificationList.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { formatPeriod, formatPeso } from '../../utils/format.js';
import { validatePaymentAmount } from '../../utils/validators.js';
import { formatDateTime, formatStatus } from '../../utils/format.js';
import { Badge } from '../../components/ui/Feedback.jsx';

export default function CashPaymentsPage() {
  const { user } = useAuth();
  const [soas, setSoas] = useState([]);
  const [soaId, setSoaId] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [paymentLog, setPaymentLog] = useState([]);
  const [paymentLogError, setPaymentLogError] = useState('');

  useEffect(() => {
    BillingApi.list()
      .then(({ soas: list }) => {
        setSoas(list.filter((s) => s.remainingBalance > 0));
        setLoadError('');
      })
      .catch((err) => setLoadError(err.message || 'Could not load statements of account.'));
  }, [refreshKey]);

  useEffect(() => {
    PaymentApi.list()
      .then(({ payments }) => setPaymentLog(payments.filter((p) => p.paymentMethod === 'CASH_ON_SITE')))
      .catch((err) => setPaymentLogError(err.message || 'Could not load your cash payment log.'));
  }, [refreshKey]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const selected = soas.find((s) => s._id === soaId);
    const errors = {
      soaId: selected ? null : 'Select a statement of account.',
      amount: validatePaymentAmount(amount, selected?.remainingBalance),
    };
    setFieldErrors(errors);
    if (errors.soaId || errors.amount) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('soaId', soaId);
      fd.append('amount', amount);
      fd.append('paymentMethod', 'CASH_ON_SITE');
      await PaymentApi.submit(fd);
      setSuccess('Cash payment logged. It now needs verification.');
      setSoaId('');
      setAmount('');
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const { message, fieldErrors: serverErrors } = describeApiError(err);
      setError(message || 'Could not log cash payment.');
      setFieldErrors({ amount: serverErrors.amount, soaId: serverErrors.soaId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <PageHeader title="Cash & payments" description="Record cash collected on-site and follow its verification." />
      <Card title="Record cash collected on-site" className="mb-6 max-w-xl">
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <ErrorBanner message={loadError} />
          <ErrorBanner message={error} />
          <SuccessBanner message={success} />
          <Field required label="Statement of account" error={fieldErrors.soaId}>
            <Select value={soaId} onChange={(e) => setSoaId(e.target.value)} error={fieldErrors.soaId}>
              <option value="">Select a statement…</option>
              {soas.map((s) => (
                <option key={s._id} value={s._id}>
                  {formatPeriod(s.billingPeriod)} — balance {formatPeso(s.remainingBalance)}
                </option>
              ))}
            </Select>
          </Field>
          <Field required label="Amount collected (₱)" error={fieldErrors.amount}>
            <TextInput type="number" min="0.01" max={Math.min(100000000, soas.find((s) => s._id === soaId)?.remainingBalance || 100000000)} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} error={fieldErrors.amount} />
          </Field>
          <Button type="submit" loading={loading}>
            Log cash payment
          </Button>
        </form>
      </Card>

      <PaymentVerificationList
        key={refreshKey}
        canVerify={(p) => p.paymentMethod === 'CASH_ON_SITE' && String(p.cashCollectedByCaretakerId) === String(user?._id || user?.id)}
      />
      <Card title="Cash collection log" description="Cash payments you have recorded and their verification status." className="mt-6">
        <ErrorBanner message={paymentLogError} />
        {paymentLog.length === 0 ? <p className="py-4 text-sm text-gray-500">No cash payments recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[40rem] text-left text-sm"><thead className="border-b text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Tenant</th><th className="py-2 pr-4">Property / room</th><th className="py-2 pr-4">Amount</th><th className="py-2">Status</th></tr></thead><tbody className="divide-y divide-gray-100">{paymentLog.map((payment) => <tr key={payment._id}><td className="py-3 pr-4">{formatDateTime(payment.timestamp || payment.createdAt)}</td><td className="py-3 pr-4">{payment.tenantName || 'Tenant'}</td><td className="py-3 pr-4">{[payment.propertyName, payment.roomNumber && `Room ${payment.roomNumber}`].filter(Boolean).join(' · ') || '—'}</td><td className="py-3 pr-4 font-semibold tabular-nums">{formatPeso(payment.amount)}</td><td className="py-3"><Badge tone={payment.verificationStatus === 'VERIFIED' ? 'green' : payment.verificationStatus === 'REJECTED' ? 'red' : 'yellow'}>{formatStatus(payment.verificationStatus)}</Badge></td></tr>)}</tbody></table></div>}
      </Card>
    </DashboardLayout>
  );
}
