import { CheckCircleIcon, ExclamationCircleIcon, InboxIcon } from '@heroicons/react/24/outline';
import { formatStatus } from '../../utils/format.js';

export function Spinner({ className = '' }) {
  return <div className={`h-6 w-6 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600 motion-reduce:animate-none ${className}`} />;
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-500" role="status">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Shown when a list has nothing yet: an icon, what's missing, and (optionally) what to do next. */
export function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = InboxIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-gray-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      <ExclamationCircleIcon className="mt-px h-5 w-5 shrink-0 text-red-500" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800" role="status">
      <CheckCircleIcon className="mt-px h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

const BADGE_TONES = {
  gray: 'bg-gray-100 text-gray-700 ring-gray-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  yellow: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
};

export function Badge({ tone = 'gray', children }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE_TONES[tone] || BADGE_TONES.gray}`}>
      {children}
    </span>
  );
}

/** A status value ("OVERDUE", "pending_activation") shown the same way on every page: "Overdue", "Pending activation". */
export function StatusBadge({ status, tones = {} }) {
  return <Badge tone={tones[status] || 'gray'}>{formatStatus(status)}</Badge>;
}
