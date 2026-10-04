import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ReviewApi from '../services/ReviewApi.js';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import { Field, FieldRequirement, TextArea } from './ui/Field.jsx';
import { ErrorBanner } from './ui/Feedback.jsx';
import { describeApiError } from '../utils/errors.js';
import { capitalizeFirst } from '../utils/textFormat.js';

const MAX_REVIEW_COMMENT = 2000;

/** Rating (required, 1 to 5) and an optional comment for one completed tenancy. */
export function ReviewForm({ reservation, onSubmitted }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (rating < 1 || rating > 5) {
      setError('Choose a rating from 1 to 5 stars.');
      return;
    }
    if (comment.length > MAX_REVIEW_COMMENT) {
      setError(`Keep your review under ${MAX_REVIEW_COMMENT} characters.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await ReviewApi.submit(reservation.propertyId._id || reservation.propertyId, { reservationId: reservation._id, rating, comment });
      onSubmitted(reservation._id);
    } catch (err) {
      setError(describeApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="mb-2 text-sm font-medium text-gray-800">{reservation.propertyId?.propertyName || 'Your stay'}{reservation.roomId?.roomNumber ? ` · Room ${reservation.roomId.roomNumber}` : ''}</p>
      <ErrorBanner message={error} />
      <p className="mb-1.5 text-sm font-medium text-gray-700">Rating<FieldRequirement required /></p>
      <div className="mb-2 flex gap-1" role="radiogroup" aria-label="Rating" aria-required="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === rating}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onClick={() => { setRating(n); setError(''); }}
            className={`text-xl ${n <= rating ? 'text-yellow-500' : 'text-gray-300'}`}
          >
            ★
          </button>
        ))}
      </div>
      <Field label="Review comment">
        <TextArea
          value={comment}
          onChange={(e) => setComment(capitalizeFirst(e.target.value))}
          placeholder="Share your experience (optional)"
          maxLength={MAX_REVIEW_COMMENT}
          className="mb-2"
          rows={2}
        />
      </Field>
      <Button onClick={submit} loading={loading} className="w-full">
        Submit review
      </Button>
    </div>
  );
}

/**
 * After a move-out, asks the tenant to rate the stay. "Later" closes it for now; it comes back
 * on the next visit until a rating is submitted. `focusReservationId` (from a notification
 * link) shows that tenancy first.
 */
export function ReviewPrompt({ focusReservationId = null }) {
  const [eligible, setEligible] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [done, setDone] = useState([]);

  useEffect(() => {
    let active = true;
    ReviewApi.listEligible()
      .then(({ eligibleReservations }) => { if (active) setEligible(eligibleReservations || []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const remaining = eligible.filter((r) => !done.includes(r._id));
  const current = remaining.find((r) => r._id === focusReservationId) || remaining[0];
  if (dismissed || !current) return null;

  return createPortal(
    <section className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Rate your stay">
      <Card className="w-full max-w-md">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Rate your stay</h2>
        <p className="mb-3 text-sm text-gray-500">Your stay has ended. A rating helps other tenants choose. Reviews appear after an admin approves them.</p>
        <ReviewForm key={current._id} reservation={current} onSubmitted={(id) => setDone((prev) => [...prev, id])} />
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" onClick={() => setDismissed(true)}>Later</Button>
        </div>
      </Card>
    </section>,
    document.body
  );
}
