import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './LoginPage.jsx';
import { ApiClientError } from '../../services/apiClient.js';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  );
}

describe('LoginPage', () => {
  afterEach(() => {
    useAuthMock.mockReset();
  });

  it('submits the entered credentials and shows no error on success', async () => {
    const login = vi.fn().mockResolvedValue({ mfaRequired: false });
    useAuthMock.mockReturnValue({ login, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: { role: 'tenant' } });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText('Password'), 'Demo123!Pass');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({ email: 'demo.tenant@gmail.com', password: 'Demo123!Pass' });
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows "Incorrect password." when the email exists but the password is wrong', async () => {
    const login = vi.fn().mockRejectedValue(new ApiClientError('Incorrect password.', 'INCORRECT_PASSWORD', 401));
    useAuthMock.mockReturnValue({ login, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect password.');
    expect(screen.queryByRole('link', { name: /register now/i })).not.toBeInTheDocument();
  });

  it('shows "This email is not registered." with a Register now link when the email has no account', async () => {
    const login = vi.fn().mockRejectedValue(new ApiClientError('This email is not registered.', 'EMAIL_NOT_REGISTERED', 401));
    useAuthMock.mockReturnValue({ login, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'nonexistent@gmail.com');
    await user.type(screen.getByLabelText('Password'), 'Whatever1!');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This email is not registered.');
    expect(screen.getByRole('link', { name: /register now/i })).toHaveAttribute('href', '/register');
  });

  it('blocks submission and shows "Email is required." when the email is empty', async () => {
    const login = vi.fn();
    useAuthMock.mockReturnValue({ login, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Password'), 'Demo123!Pass');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    expect(await screen.findByText('Email is required.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('blocks submission and shows "Please enter a valid email address." for a malformed email', async () => {
    const login = vi.fn();
    useAuthMock.mockReturnValue({ login, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'gladdielugot@gamil.com');
    await user.type(screen.getByLabelText('Password'), 'Demo123!Pass');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('flags an email with no domain extension (e.g. Angelo@calaycay05) as invalid', async () => {
    const login = vi.fn();
    useAuthMock.mockReturnValue({ login, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'Angelo@calaycay05');
    await user.tab(); // blur — validates without needing a submit click
    await user.type(screen.getByLabelText('Password'), 'Demo123!Pass');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('blocks submission and shows "Password is required." when the password is empty', async () => {
    const login = vi.fn();
    useAuthMock.mockReturnValue({ login, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    expect(await screen.findByText('Password is required.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('validates on blur, before any submit attempt', async () => {
    useAuthMock.mockReturnValue({ login: vi.fn(), verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.tab();

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();
  });

  it('clears the error live as the user corrects an already-touched field', async () => {
    useAuthMock.mockReturnValue({ login: vi.fn(), verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLoginPage();

    const emailInput = screen.getByLabelText('Email');
    await user.type(emailInput, 'not-an-email');
    await user.tab();
    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument();

    await user.type(emailInput, '.something@gmail.com');
    await waitFor(() => {
      expect(screen.queryByText('Please enter a valid email address.')).not.toBeInTheDocument();
    });
  });

  it('switches to the OTP form when MFA is required', async () => {
    const verifyLoginOtp = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      login: vi.fn(),
      verifyLoginOtp,
      mfaChallenge: { email: 'demo.tenant@gmail.com' },
      user: null,
    });
    const user = userEvent.setup();
    renderLoginPage();

    expect(screen.getByText(/enter verification code/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));

    await waitFor(() => {
      expect(verifyLoginOtp).toHaveBeenCalledWith('123456');
    });
  });

  it('strips non-digit characters from the OTP input and caps it at 6 digits', async () => {
    useAuthMock.mockReturnValue({
      login: vi.fn(),
      verifyLoginOtp: vi.fn(),
      mfaChallenge: { email: 'demo.tenant@gmail.com' },
      user: null,
    });
    const user = userEvent.setup();
    renderLoginPage();

    const otpInput = screen.getByLabelText('Verification code');
    await user.type(otpInput, 'a1b2c3d4e5f6g7');
    expect(otpInput).toHaveValue('123456');
  });
});
