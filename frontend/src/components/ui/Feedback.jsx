export function Spinner({ className = '' }) {
  return <div className={`h-6 w-6 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600 ${className}`} />;
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
      <Spinner />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ title = 'Nothing here yet', description, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 py-16 text-center">
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {description && <p className="max-w-sm text-xs text-gray-400">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {message}
    </div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">
      {message}
    </div>
  );
}

export function Badge({ tone = 'gray', children }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue: 'bg-blue-100 text-blue-700',
    brand: 'bg-brand-100 text-brand-800',
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tones[tone] || tones.gray}`}>{children}</span>;
}
