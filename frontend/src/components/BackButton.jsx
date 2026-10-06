import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useLocation, useNavigate } from 'react-router-dom';
import { stepsToPreviousPage } from '../routes/navigationHistory.js';

/**
 * The one Back control used across the app, always at the top-left of the page content.
 * - `fallback`: where Back goes when there is no usable previous in-app page (or always, with useHistory=false).
 * - `useHistory`: return to the exact previous in-app page (keeping its URL filters and scroll position) when there is one.
 * - `sameSection`: only count previous pages in the same area (tenant/landlord/caretaker/admin/public).
 * Never leaves the app: anything outside it, auth screens and submitted forms are skipped in favour of `fallback`.
 */
export default function BackButton({ fallback, label = 'Back', useHistory = true, sameSection = true, disabled = false, className = '' }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const goBack = () => {
    const steps = useHistory ? stepsToPreviousPage(pathname, { sameSection }) : 0;
    if (steps > 0) navigate(-steps);
    else navigate(fallback);
  };

  return (
    <button
      type="button"
      onClick={goBack}
      disabled={disabled}
      aria-label={label === 'Back' ? 'Go back' : label}
      title={disabled ? 'Please wait until this finishes' : undefined}
      className={`ui-button -ml-2 mb-3 inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent ${className}`}
    >
      <ArrowLeftIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}
