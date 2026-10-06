import { Link } from 'react-router-dom';
import BackButton from '../../components/BackButton.jsx';

/** Card layout for the single-purpose auth pages; Back always returns to the landing page's sign-in card. */
export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
      <div className="animate-panel-enter w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <BackButton fallback="/" label="Back to sign in" useHistory={false} />
        <Link to="/" className="mb-6 block text-center text-xl font-bold text-brand-700">
          Ledger OnBoard
        </Link>
        <h1 className="text-center text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="mt-1 text-center text-sm text-gray-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
