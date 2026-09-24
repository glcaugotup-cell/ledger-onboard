import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from './ForgotPasswordPage.jsx';
import AuthApi from '../../services/AuthApi.js';
import { ApiClientError } from '../../services/apiClient.js';

vi.mock('../../services/AuthApi.js', () => ({ default: { forgotPassword: vi.fn() } }));

describe('ForgotPasswordPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('submits the email and shows the generic confirmation message', async () => {
    AuthApi.forgotPassword.mockResolvedValue({ message: "If that account exists, we've sent a code." });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(AuthApi.forgotPassword).toHaveBeenCalledWith({ email: 'demo.tenant@gmail.com' });
    expect(await screen.findByText("If that account exists, we've sent a code.")).toBeInTheDocument();
    expect(screen.getByText(/i have a code/i)).toBeInTheDocument();
  });

  it('shows an error banner and no reset link when the request fails', async () => {
    AuthApi.forgotPassword.mockRejectedValue(new ApiClientError('Too many requests', 'RATE_LIMITED', 429));
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText('Email'), 'demo.tenant@gmail.com');
    await user.click(screen.getByRole('button', { name: /send verification code/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByText(/i have a code/i)).not.toBeInTheDocument();
  });
});
