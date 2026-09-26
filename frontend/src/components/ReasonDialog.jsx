import { useState } from 'react';
import ConfirmDialog from './ui/ConfirmDialog.jsx';
import { TextArea } from './ui/Field.jsx';
import { capitalizeFirst } from '../utils/textFormat.js';

const OTHER_REASON = 'Other';
const MAX_REASON_LENGTH = 500;

/** "Policy violation; Other: Fake listing photos" — the text saved with the action. */
function buildReason(selected, otherText) {
  return selected.map((r) => (r === OTHER_REASON ? `${OTHER_REASON}: ${otherText.trim()}` : r)).join('; ');
}

/**
 * ConfirmDialog with standardized reasons: the admin ticks one or more common
 * reasons, or "Other" and types their own. With no `reasons`, it asks only for a
 * typed reason. Pressing Confirm without a valid reason shows what's missing
 * instead of proceeding, and the action runs only on Confirm — Cancel never
 * calls `onConfirm`.
 */
export default function ReasonDialog({ open, title, message, reasons = [], confirmLabel, tone = 'danger', required = true, loading, error, onConfirm, onCancel }) {
  const [selected, setSelected] = useState([]);
  const [otherText, setOtherText] = useState('');
  const [touched, setTouched] = useState(false);

  const freeTextOnly = reasons.length === 0;
  const otherChosen = freeTextOnly || selected.includes(OTHER_REASON);
  const reason = freeTextOnly ? otherText.trim() : buildReason(selected, otherText);

  let validation = '';
  if (!freeTextOnly && required && selected.length === 0) validation = 'Select at least one reason.';
  else if (otherChosen && required && !otherText.trim()) validation = freeTextOnly ? 'Enter a reason.' : 'Describe the other reason.';
  else if (reason.length > MAX_REASON_LENGTH) validation = `Keep the reason under ${MAX_REASON_LENGTH} characters.`;

  function reset() {
    setSelected([]);
    setOtherText('');
    setTouched(false);
  }

  function toggle(option) {
    setSelected((prev) => (prev.includes(option) ? prev.filter((r) => r !== option) : [...prev, option]));
  }

  return (
    <ConfirmDialog
      open={open}
      title={title}
      message={message}
      tone={tone}
      confirmLabel={confirmLabel}
      loading={loading}
      error={error}
      onCancel={() => {
        reset();
        onCancel();
      }}
      onConfirm={() => {
        setTouched(true);
        if (validation) return;
        onConfirm(reason);
        // Leave the choices in place until the parent closes the dialog (it may show an error).
      }}
    >
      <fieldset>
        {!freeTextOnly && (
          <>
            <legend className="mb-2 text-sm font-medium text-gray-700">Reason</legend>
            <div className="space-y-1.5">
              {[...reasons, OTHER_REASON].map((option) => (
                <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.includes(option)}
                    onChange={() => toggle(option)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-400"
                  />
                  {option}
                </label>
              ))}
            </div>
          </>
        )}
        {otherChosen && (
          <label className="mt-2 block">
            <span className="mb-1 block text-sm font-medium text-gray-700">{freeTextOnly ? 'Reason' : 'Other reason'}</span>
            <TextArea
              rows={2}
              maxLength={MAX_REASON_LENGTH}
              value={otherText}
              onChange={(e) => setOtherText(capitalizeFirst(e.target.value))}
              placeholder="Type the reason"
              error={touched && validation}
            />
          </label>
        )}
        {touched && validation && <p className="mt-2 text-xs text-red-600">{validation}</p>}
      </fieldset>
    </ConfirmDialog>
  );
}
