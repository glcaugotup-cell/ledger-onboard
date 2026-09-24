import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-gray-50 text-center">
      <h1 className="text-2xl font-bold text-gray-900">404 — Page not found</h1>
      <Link to="/" className="text-brand-600 hover:underline">
        Go home
      </Link>
    </div>
  );
}
