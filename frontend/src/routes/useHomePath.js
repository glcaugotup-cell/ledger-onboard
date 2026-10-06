import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from './roleHome.js';

/**
 * The signed-in user's home page, or the landing page when signed out. Used by pages shown
 * signed in or out (404, not authorized); App.jsx renders every route inside the AuthProvider.
 */
export function useHomePath() {
  const { user } = useAuth();
  return ROLE_HOME[user?.role] || '/';
}
