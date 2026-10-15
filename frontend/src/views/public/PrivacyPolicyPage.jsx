import { Link } from 'react-router-dom';
import { ShieldCheckIcon } from '@heroicons/react/24/outline';
import PrivacyPolicyContent from '../../components/PrivacyPolicyContent.jsx';

/** Public Privacy Policy at /privacy (the same text as the sign-up modal), linkable from outside the app. */
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:py-14">
      <main className="mx-auto max-w-3xl overflow-hidden rounded-[22px] border border-gray-100 bg-white shadow-sm">
        <header className="bg-gradient-to-br from-brand-50 via-white to-amber-50/50 px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <ShieldCheckIcon className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-xl font-bold leading-tight text-gray-900 sm:text-2xl">Privacy Policy</h1>
              <p className="text-sm text-gray-500">Ledger OnBoard · Rental homes in Dagupan City</p>
            </div>
          </div>
        </header>
        <div className="h-[3px] bg-gradient-to-r from-brand-600 via-brand-400 to-amber-400" />
        <div className="px-5 py-6 text-sm leading-relaxed text-gray-700 sm:px-8 sm:py-8">
          <PrivacyPolicyContent />
        </div>
        <footer className="border-t border-gray-100 px-5 py-4 sm:px-8">
          <Link to="/" className="text-sm font-medium text-brand-700 hover:underline">
            ← Back to Ledger OnBoard
          </Link>
        </footer>
      </main>
    </div>
  );
}
