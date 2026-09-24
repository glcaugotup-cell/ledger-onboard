import { Link } from 'react-router-dom';
import PropertyDetailContent from '../../components/PropertyDetailContent.jsx';
import logo from '../../assets/logo.webp';

export default function PropertyDetailPublicPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="Ledger OnBoard" className="h-9 w-9 rounded-lg object-cover shadow-sm" />
            <span className="text-base font-bold text-brand-800">Ledger OnBoard</span>
          </Link>
          <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Sign in
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <PropertyDetailContent />
      </div>
    </div>
  );
}
