/** Labeled form field wrapper — shows a validation error message when present. */
export function Field({ label, error, hint, children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block">
      {label && <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>}
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
      {!error && hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  );
}

const baseInputClasses =
  'w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-400';

export function TextInput({ error, className = '', ...rest }) {
  return <input className={`${baseInputClasses} ${error ? 'border-red-400' : 'border-gray-300'} ${className}`} {...rest} />;
}

export function TextArea({ error, className = '', ...rest }) {
  return <textarea className={`${baseInputClasses} ${error ? 'border-red-400' : 'border-gray-300'} ${className}`} {...rest} />;
}

export function Select({ error, className = '', children, ...rest }) {
  return (
    <select className={`${baseInputClasses} bg-white ${error ? 'border-red-400' : 'border-gray-300'} ${className}`} {...rest}>
      {children}
    </select>
  );
}
