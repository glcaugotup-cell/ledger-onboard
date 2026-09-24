import { Link } from 'react-router-dom';

export default function AuthLayout({ title, subtitle, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
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
