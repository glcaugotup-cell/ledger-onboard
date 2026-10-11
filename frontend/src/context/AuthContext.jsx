import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AuthApi from '../services/AuthApi.js';
import { onSessionRevoked, setAccessToken } from '../services/apiClient.js';

const REFRESH_TOKEN_KEY = 'ledgerOnboard.refreshToken';

// The backend rotates the refresh token on every use and rejects the old one, so
// overlapping refreshes (StrictMode's double effect, several tabs reloading at once)
// must share one request instead of racing each other.
let pendingRefresh = null;
function refreshOnce(token) {
  if (!pendingRefresh) {
    pendingRefresh = AuthApi.refresh(token).finally(() => {
      pendingRefresh = null;
    });
  }
  return pendingRefresh;
}

async function resumeSession(token) {
  try {
    return await refreshOnce(token);
  } catch (err) {
    // Another tab may have already rotated the token; retry once with the newer one.
    const latest = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (latest && latest !== token) return refreshOnce(latest);
    throw err;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authenticated' | 'unauthenticated'
  // { email, challengeToken } between a correct password and the authenticator-code step.
  const [mfaChallenge, setMfaChallenge] = useState(null);

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
    resumeSession(storedRefreshToken)
      .then((session) => persistSession(session))
      .catch(() => clearSession());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = useCallback(async (payload) => {
    const { user: registered, verificationRequired } = await AuthApi.register(payload);
    // An older backend omits the field; it always required email verification.
    return { user: registered, verificationRequired: verificationRequired !== false };
  }, []);

  const login = useCallback(
    async ({ email, password }) => {
      const result = await AuthApi.login({ email, password });
      if (result.mfaRequired) {
        // Held only in memory: the 5-minute token that the code step exchanges for a session.
        setMfaChallenge({ email, challengeToken: result.challengeToken });
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
      let result;
      try {
        result = await AuthApi.verifyLoginMfa({ challengeToken: mfaChallenge.challengeToken, code });
      } catch (err) {
        // The 5-minute challenge ran out (or is no longer valid): back to the password step.
        if (err?.code === 'MFA_CHALLENGE_INVALID') setMfaChallenge(null);
        throw err;
      }
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

  // "Back to sign in" from the code step.
  const cancelMfaChallenge = useCallback(() => setMfaChallenge(null), []);

  // Signed-in password change. The backend signs every other device out and returns fresh tokens
  // for this one, so this device stays signed in.
  const changePassword = useCallback(
    async ({ currentPassword, newPassword, code }) => {
      const result = await AuthApi.changePassword({ currentPassword, newPassword, ...(code ? { code } : {}) });
      persistSession(result);
      return result;
    },
    [persistSession]
  );

  // A request was refused because the session was ended elsewhere (password changed or reset,
  // account suspended...): sign out here too, so the person lands on the sign-in page.
  useEffect(() => onSessionRevoked(() => clearSession()), [clearSession]);

  const value = useMemo(
    () => ({ user, status, mfaChallenge, register, login, verifyLoginOtp, cancelMfaChallenge, changePassword, logout, refreshProfile }),
    [user, status, mfaChallenge, register, login, verifyLoginOtp, cancelMfaChallenge, changePassword, logout, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
