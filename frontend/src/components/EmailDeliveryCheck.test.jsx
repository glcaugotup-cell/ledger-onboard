import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import EmailDeliveryCheck from './EmailDeliveryCheck.jsx';
import AdminApi from '../services/AdminApi.js';

vi.mock('../services/AdminApi.js', () => ({ default: { sendTestEmail: vi.fn() } }));

describe('EmailDeliveryCheck', () => {
  it('shows why the test email was not sent and which setting to change', async () => {
    AdminApi.sendTestEmail.mockResolvedValue({
      status: 'skipped', reason: 'console_in_production', to: 'ledgeronboard@gmail.com',
      advice: 'Sending is switched off: EMAIL_TRANSPORT is missing (or "console") on Render. Set EMAIL_TRANSPORT=brevo and save.',
      transport: 'console', apiKeyConfigured: true, senderEmail: 'sender@gmail.com', senderFormatValid: true,
      registrationVerificationRequired: true, accountFlowsEnabled: true,
    });
    const user = userEvent.setup();
    render(<EmailDeliveryCheck />);
    await user.click(screen.getByRole('button', { name: /send test email/i }));
    expect(await screen.findByText('Not sent: sending is off')).toBeInTheDocument();
    expect(screen.getByText(/Set EMAIL_TRANSPORT=brevo/)).toBeInTheDocument();
    expect(screen.getByText('console')).toBeInTheDocument();
    expect(screen.getByText('sender@gmail.com')).toBeInTheDocument();
  });

  it('shows the error when the check itself cannot run', async () => {
    AdminApi.sendTestEmail.mockRejectedValue(Object.assign(new Error('Only the main admin can run the email check'), { code: 'MAIN_ADMIN_REQUIRED' }));
    const user = userEvent.setup();
    render(<EmailDeliveryCheck />);
    await user.click(screen.getByRole('button', { name: /send test email/i }));
    expect(await screen.findByText('Only the main admin can run the email check')).toBeInTheDocument();
  });
});
