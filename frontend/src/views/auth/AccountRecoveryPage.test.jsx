import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AccountRecoveryPage from './AccountRecoveryPage.jsx';
import AuthApi from '../../services/AuthApi.js';
import { ApiClientError } from '../../services/apiClient.js';

vi.mock('../../services/AuthApi.js', () => ({ default: { recoverAccount: vi.fn() } }));

describe('AccountRecoveryPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // Recovery rule: recovery needs an authenticator, backup or admin reset code.
  it('submits the registered email, the code and the new password', async () => {
    AuthApi.recoverAccount.mockResolvedValue({ message: 'Account recovered.' });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountRecoveryPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Registered email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText(/authenticator, backup or reset code/i), 'abcd-efgh');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('button', { name: /recover account/i }));

    await waitFor(() => {
      expect(AuthApi.recoverAccount).toHaveBeenCalledWith({ email: 'demo.tenant@gmail.com', code: 'ABCD-EFGH', newPassword: 'Str0ng!Pass' });
    });
    expect(await screen.findByText('Account recovered.')).toBeInTheDocument();
  });

  it('shows an error banner when the account cannot be recovered', async () => {
    // Recovery rule: every failure now gets the generic code error.
    AuthApi.recoverAccount.mockRejectedValue(new ApiClientError('Invalid or expired code', 'INVALID_OTP', 400));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountRecoveryPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Registered email'), 'nobody@gmail.com');
    await user.type(screen.getByLabelText(/authenticator, backup or reset code/i), '123456');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('button', { name: /recover account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired code');
  });

  it('does not submit without a code, and says where to get one', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountRecoveryPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/ask an administrator for a reset code/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Registered email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('button', { name: /recover account/i }));

    expect(AuthApi.recoverAccount).not.toHaveBeenCalled();
  });

  it('blocks submission when confirm password is empty or does not match', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountRecoveryPage />
      </MemoryRouter>
    );
    await user.type(screen.getByLabelText('Registered email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pas');
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /recover account/i }));
    expect(AuthApi.recoverAccount).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/^confirm password/i), 's');
    expect(screen.getByText('Passwords match')).toBeInTheDocument();
  });
});
