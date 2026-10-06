import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from './roleHome.js';

/**
 * The signed-in user's home page, or the landing page. For pages shown signed in or out
 * (404, not authorized), including outside an AuthProvider where useAuth throws.
 */
export function useHomePath() {
  let role = null;
  try {
    role = useAuth().user?.role;
  } catch {
    role = null;
  }
  return ROLE_HOME[role] || '/';
}
