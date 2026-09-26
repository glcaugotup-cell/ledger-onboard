import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import BillingApi from '../../services/BillingApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import PaymentVerificationList from '../../components/PaymentVerificationList.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Select, TextInput } from '../../components/ui/Field.jsx';
import { ErrorBanner, SuccessBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { validatePaymentAmount } from '../../utils/validators.js';

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

  useEffect(() => {
    BillingApi.list()
      .then(({ soas: list }) => {
        setSoas(list.filter((s) => s.remainingBalance > 0));
        setLoadError('');
      })
      .catch((err) => setLoadError(err.message || 'Could not load statements of account.'));
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
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Cash &amp; payments</h1>
      <Card title="Record cash collected on-site" className="mb-6 max-w-xl">
        <form onSubmit={onSubmit} noValidate className="space-y-3">
          <ErrorBanner message={loadError} />
          <ErrorBanner message={error} />
          <SuccessBanner message={success} />
          <Field label="Statement of account" error={fieldErrors.soaId}>
            <Select value={soaId} onChange={(e) => setSoaId(e.target.value)} error={fieldErrors.soaId}>
              <option value="">Select a statement…</option>
              {soas.map((s) => (
                <option key={s._id} value={s._id}>
                  {new Date(s.billingPeriod).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} — balance ₱{s.remainingBalance.toLocaleString()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount collected (₱)" error={fieldErrors.amount}>
            <TextInput type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} error={fieldErrors.amount} />
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
    </DashboardLayout>
  );
}
