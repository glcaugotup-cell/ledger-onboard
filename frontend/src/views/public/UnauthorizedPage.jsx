import { Link } from 'react-router-dom';
import BackButton from '../../components/BackButton.jsx';
import { useHomePath } from '../../routes/useHomePath.js';

export default function UnauthorizedPage() {
  const home = useHomePath();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 px-4 text-center">
      <BackButton fallback={home} sameSection={false} />
      <h1 className="text-2xl font-bold text-gray-900">403 — Not authorized</h1>
      <p className="text-gray-500">You don&apos;t have permission to view this page.</p>
      <Link to="/" className="text-brand-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}
