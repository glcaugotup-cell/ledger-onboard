import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Route guard per role.
 * This is a UX convenience only — the real authorization boundary is the
 * server's RBAC middleware; hiding a route here never substitutes for it.
 */
export default function ProtectedRoute({ roles }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">Loading…</div>
    );
  }

  if (status === 'unauthenticated' || !user) {
    // Unauthenticated visitors go to the landing page, whose Hero offers login/register.
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  if (roles && roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
