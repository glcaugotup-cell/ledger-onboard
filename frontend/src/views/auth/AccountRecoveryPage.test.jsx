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

  it('submits the registered email and new password', async () => {
    AuthApi.recoverAccount.mockResolvedValue({ message: 'Account recovered.' });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountRecoveryPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Registered email'), 'demo.tenant@gmail.com');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('button', { name: /recover account/i }));

    await waitFor(() => {
      expect(AuthApi.recoverAccount).toHaveBeenCalledWith({ email: 'demo.tenant@gmail.com', newPassword: 'Str0ng!Pass' });
    });
    expect(await screen.findByText('Account recovered.')).toBeInTheDocument();
  });

  it('shows an error banner when the account cannot be recovered', async () => {
    AuthApi.recoverAccount.mockRejectedValue(new ApiClientError('No archived account found for that email', 'NOT_FOUND', 404));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AccountRecoveryPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Registered email'), 'nobody@gmail.com');
    await user.type(screen.getByLabelText(/^new password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('button', { name: /recover account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No archived account found for that email');
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
