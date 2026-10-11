import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ResetCodeDialog from './ResetCodeDialog.jsx';
import AdminApi from '../services/AdminApi.js';
import { ApiClientError } from '../services/apiClient.js';

vi.mock('../services/AdminApi.js', () => ({ default: { issueResetCode: vi.fn() } }));

const USER = { _id: 'u1', fullName: 'Juan Tenant', email: 'juan@gmail.com', role: 'tenant' };
const EXPIRES = new Date(Date.UTC(2026, 9, 12, 6, 30)).toISOString();

function renderDialog() {
  const onClose = vi.fn();
  render(<ResetCodeDialog user={USER} onClose={onClose} />);
  return { onClose };
}

describe('ResetCodeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('first reminds the admin to confirm the person in person, and creates nothing until confirmed', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    expect(screen.getByText(/confirming in person that you are talking to juan tenant/i)).toBeInTheDocument();
    expect(screen.getByText(/works once and expires in 30 minutes/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(AdminApi.issueResetCode).not.toHaveBeenCalled();
  });

  it('shows the code once, with a copy button and the expiry time', async () => {
    AdminApi.issueResetCode.mockResolvedValue({ code: 'ABCD-EFGH', expiresAt: EXPIRES });
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole('button', { name: /create code/i }));

    expect(AdminApi.issueResetCode).toHaveBeenCalledWith('u1');
    expect(await screen.findByTestId('reset-code')).toHaveTextContent('ABCD-EFGH');
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Expires at ${new Date(EXPIRES).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /copy code/i }));
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH');
    expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a server error and no code', async () => {
    AdminApi.issueResetCode.mockRejectedValue(new ApiClientError('Admin accounts cannot be modified through this endpoint', 'CANNOT_MODIFY_ADMIN', 403));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole('button', { name: /create code/i }));

    expect(await screen.findByText('Admin accounts cannot be modified through this endpoint')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId('reset-code')).not.toBeInTheDocument());
  });
});
