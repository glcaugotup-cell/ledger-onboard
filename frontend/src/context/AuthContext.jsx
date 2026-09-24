import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AuthApi from '../services/AuthApi.js';
import { setAccessToken } from '../services/apiClient.js';

const REFRESH_TOKEN_KEY = 'ledgerOnboard.refreshToken';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authenticated' | 'unauthenticated'
  const [mfaChallenge, setMfaChallenge] = useState(null); // { email } while awaiting OTP

  const persistSession = useCallback((session) => {
    setAccessToken(session.accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
    setUser(session.user);
    setStatus('authenticated');
    setMfaChallenge(null);
  }, []);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  // On first load, try to silently resume a session from the stored refresh token.
  useEffect(() => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) {
      setStatus('unauthenticated');
      return;
    }
    AuthApi.refresh(storedRefreshToken)
      .then((session) => persistSession(session))
      .catch(() => clearSession());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = useCallback(async (payload) => {
    const { user: registered } = await AuthApi.register(payload);
    return registered;
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      const result = await AuthApi.login({ email, password });
      if (result.mfaRequired) {
        setMfaChallenge({ email: result.email });
        return { mfaRequired: true };
      }
      persistSession(result);
      // Returned directly because callers can't rely on context `user` until the next render.
      return { mfaRequired: false, user: result.user };
    },
    [persistSession]
  );

  const verifyLoginOtp = useCallback(
    async (code) => {
      if (!mfaChallenge) throw new Error('No login is currently awaiting a verification code.');
      const result = await AuthApi.verifyOtp({ email: mfaChallenge.email, code, purpose: 'login_mfa' });
      persistSession(result);
      return result.user;
    },
    [mfaChallenge, persistSession]
  );

  const logout = useCallback(async () => {
    try {
      await AuthApi.logout();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const refreshProfile = useCallback(async () => {
    const { user: fresh } = await AuthApi.getMe();
    setUser(fresh);
    return fresh;
  }, []);

  const value = useMemo(
    () => ({ user, status, mfaChallenge, register, login, verifyLoginOtp, logout, refreshProfile }),
    [user, status, mfaChallenge, register, login, verifyLoginOtp, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
