import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import AuthApi from '../services/AuthApi.js';
import { setAccessToken } from '../services/apiClient.js';

vi.mock('../services/AuthApi.js', () => ({
  default: { register: vi.fn(), login: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn(), refresh: vi.fn(), getMe: vi.fn() },
}));
vi.mock('../services/apiClient.js', () => ({ setAccessToken: vi.fn() }));

const REFRESH_KEY = 'ledgerOnboard.refreshToken';

function Harness() {
  const { user, status, mfaChallenge, register, login, verifyLoginOtp, logout, refreshProfile } = useAuth();
  return (
    <div>
      <p data-testid="status">{status}</p>
      <p data-testid="user">{user ? user.fullName : 'none'}</p>
      <p data-testid="mfa">{mfaChallenge ? mfaChallenge.email : 'none'}</p>
      <button onClick={() => register({ email: 'juan@gmail.com' })}>register</button>
      <button onClick={() => login({ email: 'juan@gmail.com', password: 'x' })}>login</button>
      <button onClick={() => verifyLoginOtp('123456').catch(() => {})}>verify</button>
      <button onClick={() => logout().catch(() => {})}>logout</button>
      <button onClick={() => refreshProfile()}>refresh</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <AuthProvider>
      <Harness />
    </AuthProvider>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts unauthenticated when no refresh token is stored', async () => {
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(AuthApi.refresh).not.toHaveBeenCalled();
  });

  it('silently resumes a session from a stored refresh token', async () => {
    localStorage.setItem(REFRESH_KEY, 'stored-refresh-token');
    AuthApi.refresh.mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1', user: { fullName: 'Juan Dela Cruz', role: 'tenant' } });
    renderHarness();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(AuthApi.refresh).toHaveBeenCalledWith('stored-refresh-token');
    expect(screen.getByTestId('user')).toHaveTextContent('Juan Dela Cruz');
    expect(setAccessToken).toHaveBeenCalledWith('a1');
  });

  it('clears the session when resuming from a stored refresh token fails', async () => {
    localStorage.setItem(REFRESH_KEY, 'expired-token');
    AuthApi.refresh.mockRejectedValue(new Error('expired'));
    renderHarness();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('logs in without MFA and persists the session', async () => {
    AuthApi.login.mockResolvedValue({ mfaRequired: false, accessToken: 'a1', refreshToken: 'r1', user: { fullName: 'Juan Dela Cruz', role: 'tenant' } });
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    await user.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(localStorage.getItem(REFRESH_KEY)).toBe('r1');
  });

  it('sets an MFA challenge instead of a session when the login requires it', async () => {
    AuthApi.login.mockResolvedValue({ mfaRequired: true, email: 'juan@gmail.com' });
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    await user.click(screen.getByRole('button', { name: 'login' }));

    await waitFor(() => expect(screen.getByTestId('mfa')).toHaveTextContent('juan@gmail.com'));
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('verifies the login OTP and persists the resulting session', async () => {
    AuthApi.login.mockResolvedValue({ mfaRequired: true, email: 'juan@gmail.com' });
    AuthApi.verifyOtp.mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1', user: { fullName: 'Juan Dela Cruz', role: 'tenant' } });
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    await user.click(screen.getByRole('button', { name: 'login' }));
    await waitFor(() => expect(screen.getByTestId('mfa')).toHaveTextContent('juan@gmail.com'));

    await user.click(screen.getByRole('button', { name: 'verify' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(AuthApi.verifyOtp).toHaveBeenCalledWith({ email: 'juan@gmail.com', code: '123456', purpose: 'login_mfa' });
    expect(screen.getByTestId('mfa')).toHaveTextContent('none');
  });

  it('rejects verifyLoginOtp when there is no active MFA challenge', async () => {
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    await user.click(screen.getByRole('button', { name: 'verify' }));

    expect(AuthApi.verifyOtp).not.toHaveBeenCalled();
  });

  it('clears the session on logout even if the API call fails', async () => {
    localStorage.setItem(REFRESH_KEY, 'stored-refresh-token');
    AuthApi.refresh.mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1', user: { fullName: 'Juan Dela Cruz', role: 'tenant' } });
    AuthApi.logout.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await user.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it('refreshes the profile and updates the user', async () => {
    localStorage.setItem(REFRESH_KEY, 'stored-refresh-token');
    AuthApi.refresh.mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1', user: { fullName: 'Juan Dela Cruz', role: 'tenant' } });
    AuthApi.getMe.mockResolvedValue({ user: { fullName: 'Juan Updated', role: 'tenant' } });
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Juan Dela Cruz'));

    await user.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Juan Updated'));
  });
});
