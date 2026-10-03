import { useEffect, useState } from 'react';
import PaymentApi from '../services/PaymentApi.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import ReasonDialog from './ReasonDialog.jsx';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import { Field, TextInput } from './ui/Field.jsx';
import { CheckBadgeIcon, DevicePhoneMobileIcon, BanknotesIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { EmptyState, ErrorBanner, LoadingState, StatusBadge } from './ui/Feedback.jsx';
import { formatDateTime, formatPeriod, formatPeso } from '../utils/format.js';

const STATUS_TONE = { PENDING: 'yellow', VERIFIED: 'green', REJECTED: 'red' };
const METHOD = {
  GCASH_SCREENSHOT: { label: 'GCash', icon: DevicePhoneMobileIcon },
  GCASH_QR: { label: 'GCash QR', icon: DevicePhoneMobileIcon },
  CASH_ON_SITE: { label: 'Cash on site', icon: BanknotesIcon },
};

/** Amount, method, who paid and which bill — the facts needed to decide on a payment. */
function PaymentSummary({ payment: p }) {
  const method = METHOD[p.paymentMethod] || { label: p.paymentMethod, icon: BanknotesIcon };
  const context = [p.tenantName, p.billingPeriod && `${formatPeriod(p.billingPeriod)} bill`, [p.propertyName, p.roomNumber && `Room ${p.roomNumber}`].filter(Boolean).join(' · ')]
    .filter(Boolean)
    .join(' — ');
  return (
    <div className="flex min-w-0 gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
        <method.icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-gray-900">
          {formatPeso(p.amount)} — {method.label}
        </p>
        {context && <p className="text-sm text-gray-600">{context}</p>}
        {p.referenceNumber && <p className="text-sm font-medium text-gray-700">Reference: {p.referenceNumber}</p>}
        <p className="text-xs text-gray-500">{formatDateTime(p.timestamp || p.createdAt)}</p>
      </div>
    </div>
  );
}

function ProofImage({ paymentId }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let revoke;
    PaymentApi.fetchProofImageObjectUrl(paymentId).then((u) => {
      setUrl(u);
      revoke = u;
    });
    return () => revoke && URL.revokeObjectURL(revoke);
  }, [paymentId]);
  if (!url) return <div className="h-32 w-full animate-pulse rounded-lg bg-gray-100" />;
  return <img src={url} alt="Payment proof" className="max-h-64 rounded-lg border border-gray-200" />;
}

export default function PaymentVerificationList({ canVerify, landlordMode = false }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [rejecting, setRejecting] = useState(null); // payment id awaiting a rejection reason
  const [adjusting, setAdjusting] = useState(null);
  const [balanceValue, setBalanceValue] = useState('');
  const [balanceError, setBalanceError] = useState('');

  const load = () => {
    setLoading(true);
    PaymentApi.list()
      .then(({ payments: list }) => setPayments(list))
      .catch(() => setError('Could not load payments.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const verify = async (id, payload) => {
    setBusyId(id);
    setError('');
    try {
      await PaymentApi.verify(id, payload);
      load();
      return true;
    } catch (err) {
      setError(err.message || 'Could not verify payment.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const pending = payments.filter((p) => p.verificationStatus === 'PENDING');
  const reviewed = payments.filter((p) => p.verificationStatus !== 'PENDING');

  return (
    <div className="space-y-8">
      <ErrorBanner message={error} />
      {loading && <LoadingState label="Loading payments…" />}

      {!loading && (
        <>
          <section aria-labelledby="awaiting-heading">
            <h2 id="awaiting-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Awaiting verification
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs normal-case tracking-normal text-gray-700">{pending.length}</span>
            </h2>
            {pending.length === 0 && <EmptyState icon={CheckBadgeIcon} title="Nothing to verify" description="New GCash proofs and cash collections appear here." />}
            <div className="space-y-3">
              {pending.map((p) => (
                <Card key={p._id} className="border-l-4 border-l-amber-400">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <PaymentSummary payment={p} />
                    {canVerify(p) && (
                      landlordMode ? (
                        <div className="flex flex-wrap gap-2">
                          <Button loading={busyId === p._id} onClick={() => verify(p._id, { decision: 'COMPLETE' })}>Complete payment</Button>
                          <Button variant="secondary" disabled={busyId === p._id} onClick={() => { setAdjusting(p); setBalanceValue(String(p.remainingBalance ?? '')); setBalanceError(''); }}>Not complete · set balance</Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 sm:flex">
                          <Button loading={busyId === p._id} onClick={() => verify(p._id, { approve: true })}>Verify</Button>
                          <Button variant="danger" loading={busyId === p._id} onClick={() => setRejecting(p._id)}>Reject</Button>
                        </div>
                      )
                    )}
                  </div>
                  {landlordMode && p.remainingBalance != null && <p className="mt-3 text-sm font-medium text-gray-700">Current tenant balance: {formatPeso(p.remainingBalance)}</p>}
                  {p.proofImageURL && (
                    <button
                      className="mt-3 inline-flex items-center gap-1 rounded text-sm font-medium text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      onClick={() => setExpandedId(expandedId === p._id ? null : p._id)}
                      aria-expanded={expandedId === p._id}
                    >
                      <PhotoIcon className="h-4 w-4" aria-hidden="true" />
                      {expandedId === p._id ? 'Hide proof' : 'View proof'}
                    </button>
                  )}
                  {expandedId === p._id && (
                    <div className="mt-3">
                      <ProofImage paymentId={p._id} />
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <section aria-labelledby="payment-history-heading">
            <h2 id="payment-history-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              History
            </h2>
            {reviewed.length === 0 && <p className="text-sm text-gray-500">Verified and rejected payments appear here.</p>}
            <div className="space-y-2">
              {reviewed.map((p) => (
                <Card key={p._id}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <PaymentSummary payment={p} />
                    <StatusBadge status={p.verificationStatus} tones={STATUS_TONE} />
                  </div>
                  {p.rejectionReason && <p className="mt-2 text-sm text-red-600">Reason: {p.rejectionReason}</p>}
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
      {rejecting && (
        <ReasonDialog
          open
          title="Reject this payment?"
          message="The tenant will be told the payment could not be verified. Add a reason so they know what to fix (optional)."
          required={false}
          confirmLabel="Reject payment"
          onConfirm={(reason) => {
            const id = rejecting;
            setRejecting(null);
            verify(id, { approve: false, rejectionReason: reason });
          }}
          onCancel={() => setRejecting(null)}
        />
      )}
      {adjusting && (
        <ConfirmDialog
          open
          title="Set tenant’s remaining balance"
          message={`Payment submitted: ${formatPeso(adjusting.amount)} · Current balance: ${formatPeso(adjusting.remainingBalance || 0)}. Enter the balance after applying the amount you confirmed.`}
          confirmLabel="Save balance"
          loading={busyId === adjusting._id}
          error={balanceError || error}
          confirmDisabled={balanceValue === '' || Number(balanceValue) < 0 || Number(balanceValue) >= Number(adjusting.remainingBalance)}
          onConfirm={async () => {
            const nextBalance = Number(balanceValue);
            const minimum = Math.max(0, Number(adjusting.remainingBalance) - Number(adjusting.amount));
            if (!Number.isFinite(nextBalance) || nextBalance < minimum || nextBalance >= Number(adjusting.remainingBalance)) {
              setBalanceError(`Enter a balance from ${formatPeso(minimum)} to ${formatPeso(adjusting.remainingBalance)}.`);
              return;
            }
            const saved = await verify(adjusting._id, { decision: 'SET_BALANCE', remainingBalance: nextBalance });
            if (saved) setAdjusting(null);
          }}
          onCancel={() => { setAdjusting(null); setBalanceError(''); }}
        >
          <Field required label="New remaining balance (₱)">
            <TextInput type="number" min="0" max={adjusting.remainingBalance} step="0.01" value={balanceValue} onChange={(e) => { setBalanceValue(e.target.value); setBalanceError(''); }} />
          </Field>
        </ConfirmDialog>
      )}
    </div>
  );
}
