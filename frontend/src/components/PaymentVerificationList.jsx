import { useEffect, useState } from 'react';
import PaymentApi from '../services/PaymentApi.js';
import Card from './ui/Card.jsx';
import Button from './ui/Button.jsx';
import { Badge, EmptyState, ErrorBanner, LoadingState } from './ui/Feedback.jsx';

const STATUS_TONE = { PENDING: 'yellow', VERIFIED: 'green', REJECTED: 'red' };

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

export default function PaymentVerificationList({ canVerify }) {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = () => {
    setLoading(true);
    PaymentApi.list()
      .then(({ payments: list }) => setPayments(list))
      .catch(() => setError('Could not load payments.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const verify = async (id, approve) => {
    setBusyId(id);
    setError('');
    try {
      const rejectionReason = approve ? undefined : prompt('Reason for rejecting this payment?') || 'Not specified';
      await PaymentApi.verify(id, { approve, rejectionReason });
      load();
    } catch (err) {
      setError(err.message || 'Could not verify payment.');
    } finally {
      setBusyId(null);
    }
  };

  const pending = payments.filter((p) => p.verificationStatus === 'PENDING');
  const reviewed = payments.filter((p) => p.verificationStatus !== 'PENDING');

  return (
    <div>
      <ErrorBanner message={error} />
      {loading && <LoadingState />}

      {!loading && (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Awaiting verification</h2>
          {pending.length === 0 && <EmptyState title="Nothing to verify" />}
          <div className="mb-8 space-y-3">
            {pending.map((p) => (
              <Card key={p._id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">₱{p.amount.toLocaleString()} — {p.paymentMethod.replace('_', ' ')}</p>
                    <p className="text-xs text-gray-400">{new Date(p.timestamp).toLocaleString()}</p>
                    {p.proofImageURL && (
                      <button className="mt-1 text-xs text-brand-600 hover:underline" onClick={() => setExpandedId(expandedId === p._id ? null : p._id)}>
                        {expandedId === p._id ? 'Hide proof' : 'View proof'}
                      </button>
                    )}
                  </div>
                  {canVerify(p) && (
                    <div className="flex gap-2">
                      <Button loading={busyId === p._id} onClick={() => verify(p._id, true)}>
                        Verify
                      </Button>
                      <Button variant="danger" loading={busyId === p._id} onClick={() => verify(p._id, false)}>
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
                {expandedId === p._id && (
                  <div className="mt-3">
                    <ProofImage paymentId={p._id} />
                  </div>
                )}
              </Card>
            ))}
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">History</h2>
          <div className="space-y-2">
            {reviewed.map((p) => (
              <Card key={p._id}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">₱{p.amount.toLocaleString()} — {p.paymentMethod.replace('_', ' ')}</p>
                    {p.rejectionReason && <p className="text-xs text-red-500">{p.rejectionReason}</p>}
                  </div>
                  <Badge tone={STATUS_TONE[p.verificationStatus]}>{p.verificationStatus}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
