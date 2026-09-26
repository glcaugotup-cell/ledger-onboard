const VARIANTS = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300',
  secondary: 'bg-white text-brand-700 border border-brand-300 hover:bg-brand-50 active:bg-brand-100 disabled:border-gray-200 disabled:text-gray-400',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:bg-red-300',
  ghost: 'bg-transparent text-gray-600 hover:bg-gray-100 active:bg-gray-200 disabled:text-gray-300',
  // Amber call-to-action used for the auth screens' primary buttons.
  accent: 'bg-amber-500 text-white shadow-sm hover:bg-amber-600 active:bg-amber-700 disabled:bg-amber-300',
};

export default function Button({ variant = 'primary', className = '', loading = false, disabled, children, ...rest }) {
  return (
    <button
      className={`inline-flex min-h-[2.5rem] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" aria-hidden="true" />}
      {children}
    </button>
  );
}
