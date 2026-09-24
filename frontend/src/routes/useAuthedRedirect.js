import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLE_HOME } from './roleHome.js';

/**
 * Sends an already-logged-in user from public-only pages (login/register) to
 * their role's home page. Also handles the redirect after logging in on /login.
 */
export function useAuthedRedirect() {
  const { user, status } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === 'authenticated' && user) {
      navigate(ROLE_HOME[user.role] || '/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
}
