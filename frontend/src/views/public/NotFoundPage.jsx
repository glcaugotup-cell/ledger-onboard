import { Link } from 'react-router-dom';
import BackButton from '../../components/BackButton.jsx';
import { useHomePath } from '../../routes/useHomePath.js';

export default function NotFoundPage() {
  const home = useHomePath();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
      <BackButton fallback={home} sameSection={false} />
      <h1 className="text-2xl font-bold text-gray-900">404 — Page not found</h1>
      <Link to="/" className="text-brand-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}
