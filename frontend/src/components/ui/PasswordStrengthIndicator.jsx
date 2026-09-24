import { getPasswordStrength } from '../../utils/validators.js';

/** One color per level — the single source for every password form's strength bar. */
const LEVEL_STYLES = {
  weak: { bar: 'bg-red-500', text: 'text-red-600' },
  fair: { bar: 'bg-orange-500', text: 'text-orange-600' },
  good: { bar: 'bg-amber-400', text: 'text-amber-600' },
  strong: { bar: 'bg-green-500', text: 'text-green-700' },
};

const SEGMENTS = [1, 2, 3, 4];

/**
 * Compact 4-segment strength bar + text label shown under a new-password
 * field. Purely visual — the real requirements are still enforced by
 * validatePassword() and the backend.
 */
export default function PasswordStrengthIndicator({ password, className = '' }) {
  const { level, label, segments } = getPasswordStrength(password);
  const style = level ? LEVEL_STYLES[level] : null;

  return (
    <div className={`mt-2 ${className}`} data-strength={level || 'empty'}>
      <div
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={segments}
        aria-valuetext={level ? label : 'Not rated'}
        className="flex gap-1"
      >
        {SEGMENTS.map((i) => (
          <span
            key={i}
            data-filled={i <= segments}
            className={`h-1 flex-1 rounded-full transition-colors duration-200 ease-out ${i <= segments ? style.bar : 'bg-gray-200'}`}
          />
        ))}
      </div>
      <p className={`mt-1 text-xs font-medium transition-colors duration-200 ease-out ${style ? style.text : 'text-gray-400'}`} aria-live="polite">
        Password strength: {label}
      </p>
    </div>
  );
}
