import { useEffect, useState } from 'react';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import BillingApi from '../../services/BillingApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, TextInput } from '../../components/ui/Field.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState, SuccessBanner } from '../../components/ui/Feedback.jsx';

const STATUS_TONE = { UNPAID: 'yellow', PARTIAL: 'blue', PAID: 'green', OVERDUE: 'red' };

function PaySoaForm({ soa, onDone }) {
  const [amount, setAmount] = useState(String(soa.remainingBalance));
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!file) return setError('Please attach a screenshot of your GCash payment.');
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
      setError(err.message || 'Could not submit payment.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <ErrorBanner message={error} />
      <Field label="Amount (₱)">
        <TextInput type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </Field>
      <Field label="GCash screenshot">
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files[0])} required className="text-sm" />
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

  return (
    <DashboardLayout>
      <h1 className="mb-4 text-xl font-semibold text-gray-900">Billing &amp; statements</h1>
      <ErrorBanner message={error} />
      <SuccessBanner message={successMsg} />
      {loading && <LoadingState />}
      {!loading && soas.length === 0 && <EmptyState title="No statements yet" description="Your monthly statement of account appears here once a caretaker logs a utility reading." />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {soas.map((soa) => (
          <Card key={soa._id}>
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium text-gray-900">
                {new Date(soa.billingPeriod).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </p>
              <Badge tone={STATUS_TONE[soa.paymentStatus]}>{soa.paymentStatus}</Badge>
            </div>
            <dl className="space-y-1 text-sm text-gray-600">
              <div className="flex justify-between"><dt>Base rent</dt><dd>₱{soa.baseRent.toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt>Electric share</dt><dd>₱{soa.electricShare.toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt>Water share</dt><dd>₱{soa.waterShare.toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt>Previous arrears</dt><dd>₱{soa.previousArrears.toLocaleString()}</dd></div>
              <div className="flex justify-between font-semibold text-gray-900"><dt>Total due</dt><dd>₱{soa.totalAmountDue.toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt>Amount paid</dt><dd>₱{soa.amountPaid.toLocaleString()}</dd></div>
              <div className="flex justify-between font-semibold text-gray-900"><dt>Remaining balance</dt><dd>₱{soa.remainingBalance.toLocaleString()}</dd></div>
              <div className="flex justify-between text-xs text-gray-400"><dt>Due date</dt><dd>{new Date(soa.dueDate).toLocaleDateString()}</dd></div>
            </dl>

            {soa.remainingBalance > 0 && soa.paymentStatus !== 'PAID' && (
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
                  <Button className="mt-3 w-full" variant="secondary" onClick={() => setPayingId(soa._id)}>
                    Pay via GCash
                  </Button>
                )}
              </>
            )}
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
