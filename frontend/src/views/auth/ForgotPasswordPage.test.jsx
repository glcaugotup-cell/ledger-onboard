import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ForgotPasswordPage from './ForgotPasswordPage.jsx';
import AuthApi from '../../services/AuthApi.js';
import { ApiClientError } from '../../services/apiClient.js';

vi.mock('../../services/AuthApi.js', () => ({ default: { forgotPassword: vi.fn() } }));

/** Stands in for the reset page so the test can see what was handed over. */
function ResetPageProbe() {
  const { state } = useLocation();
  return <p data-testid="reset-page">{JSON.stringify(state)}</p>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPageProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ForgotPasswordPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('leads with emailing a recovery code, and keeps the other codes as a fallback', () => {
    renderPage();
    expect(screen.getByText("Enter your Ledger OnBoard email and we'll send you a one-time recovery code.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send recovery code' })).toBeInTheDocument();
    expect(screen.getByText(/authenticator app, one of your backup codes, or a reset code from an\s+administrator/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'I already have a code' })).toHaveAttribute('href', '/reset-password');
  });

  it('sends the code and continues to the reset page with the email and the generic message', async () => {
    AuthApi.forgotPassword.mockResolvedValue({ message: 'If an eligible account matches that email, a reset code has been sent.' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), ' demo.tenant@gmail.com ');
    await user.click(screen.getByRole('button', { name: 'Send recovery code' }));

    expect(AuthApi.forgotPassword).toHaveBeenCalledWith({ email: 'demo.tenant@gmail.com' });
    const handedOver = JSON.parse((await screen.findByTestId('reset-page')).textContent);
    expect(handedOver).toEqual({ email: 'demo.tenant@gmail.com', notice: 'If an eligible account matches that email, a reset code has been sent.' });
  });

  it('stays on the page with an error when the request fails', async () => {
    AuthApi.forgotPassword.mockRejectedValue(new ApiClientError('Too many requests', 'RATE_LIMITED', 429));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/email address/i), 'demo.tenant@gmail.com');
    await user.click(screen.getByRole('button', { name: 'Send recovery code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByTestId('reset-page')).not.toBeInTheDocument();
  });
});
