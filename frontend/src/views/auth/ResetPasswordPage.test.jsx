import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResetPasswordPage from './ResetPasswordPage.jsx';
import AuthApi from '../../services/AuthApi.js';
import { ApiClientError } from '../../services/apiClient.js';

vi.mock('../../services/AuthApi.js', () => ({ default: { resetPassword: vi.fn() } }));

describe('ResetPasswordPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('pre-fills the email from router state passed by ForgotPasswordPage', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/reset-password', state: { email: 'demo.tenant@gmail.com' } }]}>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    expect(screen.getByLabelText('Email')).toHaveValue('demo.tenant@gmail.com');
  });

  // Phase 4 rule: the field takes an authenticator code, a backup code or an admin reset code, so it
  // keeps letters, digits and the dash (upper-cased) up to XXXXX-XXXXX.
  it('keeps letters, digits and the dash in the code field, upper-cased and capped at 11 characters', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    const code = screen.getByLabelText('Authenticator, backup or reset code');
    await user.type(code, 'ab#cd e-fg!hjkLMN');
    expect(code).toHaveValue('ABCDE-FGHJK');
  });

  it('explains the three kinds of code and never mentions email', () => {
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/authenticator app, one of your backup codes, or a reset code from an administrator/i)).toBeInTheDocument();
    expect(screen.queryByText(/emailed/i)).not.toBeInTheDocument();
  });

  it('sends an admin reset code as typed', async () => {
    AuthApi.resetPassword.mockResolvedValue({ message: 'Password has been reset. You can now log in.' });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText('Authenticator, backup or reset code'), 'abcd-efgh');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));
    await waitFor(() => expect(AuthApi.resetPassword).toHaveBeenCalledWith({ email: 'demo.tenant@gmail.com', code: 'ABCD-EFGH', newPassword: 'Str0ng!Pass' }));
  });

  it('submits email/code/new password and shows a success message', async () => {
    AuthApi.resetPassword.mockResolvedValue({ message: 'Password reset successfully.' });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText('Authenticator, backup or reset code'), '123456');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(AuthApi.resetPassword).toHaveBeenCalledWith({
        email: 'demo.tenant@gmail.com',
        code: '123456',
        newPassword: 'Str0ng!Pass',
      });
    });
    expect(await screen.findByText('Password reset successfully.')).toBeInTheDocument();
  });

  it('shows an error banner when the code is invalid', async () => {
    AuthApi.resetPassword.mockRejectedValue(new ApiClientError('Invalid or expired code', 'INVALID_OTP', 400));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText('Authenticator, backup or reset code'), '000000');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired code');
  });

  it('blocks submission (no API call) for an invalid password or a mismatched confirm', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ResetPasswordPage />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText('Authenticator, backup or reset code'), '123456');
    await user.type(screen.getByLabelText(/^new password/i), 'weakpass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'weakpass');
    await user.click(screen.getByRole('button', { name: /reset password/i }));
    expect(screen.getByRole('alert')).toHaveTextContent('Password needs an uppercase letter, a number and a special character.');

    await user.clear(screen.getByLabelText(/^new password/i));
    await user.type(screen.getByLabelText(/^new password/i), 'Angelo@calaycay66');
    expect(screen.getByRole('meter', { name: 'Password strength' })).toHaveAttribute('aria-valuetext', 'Strong');
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    expect(AuthApi.resetPassword).not.toHaveBeenCalled();
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();
  });
});
