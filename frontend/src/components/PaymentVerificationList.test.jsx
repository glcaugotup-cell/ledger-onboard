import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentVerificationList from './PaymentVerificationList.jsx';
import PaymentApi from '../services/PaymentApi.js';

vi.mock('../services/PaymentApi.js', () => ({
  default: { list: vi.fn(), verify: vi.fn(), fetchProofImageObjectUrl: vi.fn() },
}));

const pendingPayment = {
  _id: 'pay1',
  amount: 1500,
  paymentMethod: 'GCASH_SCREENSHOT',
  timestamp: '2026-09-20T10:00:00Z',
  verificationStatus: 'PENDING',
  proofImageURL: '/uploads/proof1.png',
};
const reviewedPayment = { _id: 'pay2', amount: 2000, paymentMethod: 'CASH_ON_SITE', timestamp: '2026-09-10T10:00:00Z', verificationStatus: 'VERIFIED' };

describe('PaymentVerificationList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an empty state when nothing is pending', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [reviewedPayment] });
    render(<PaymentVerificationList canVerify={() => true} />);
    expect(await screen.findByText(/nothing to verify/i)).toBeInTheDocument();
    // paymentMethod.replace('_', ' ') only replaces the first underscore.
    expect(screen.getByText('₱2,000 — CASH ON_SITE')).toBeInTheDocument();
  });

  it('splits payments into pending and history sections', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment, reviewedPayment] });
    render(<PaymentVerificationList canVerify={() => true} />);
    expect(await screen.findByText('₱1,500 — GCASH SCREENSHOT')).toBeInTheDocument();
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
  });

  it('hides verify/reject actions when canVerify returns false', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment] });
    render(<PaymentVerificationList canVerify={() => false} />);
    await screen.findByText('₱1,500 — GCASH SCREENSHOT');
    expect(screen.queryByRole('button', { name: /^verify$/i })).not.toBeInTheDocument();
  });

  it('verifies a payment and reloads the list', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment] });
    PaymentApi.verify.mockResolvedValue({});
    const user = userEvent.setup();
    render(<PaymentVerificationList canVerify={() => true} />);

    await user.click(await screen.findByRole('button', { name: /^verify$/i }));

    await waitFor(() => {
      expect(PaymentApi.verify).toHaveBeenCalledWith('pay1', { approve: true, rejectionReason: undefined });
    });
    expect(PaymentApi.list).toHaveBeenCalledTimes(2);
  });

  it('rejects a payment using the prompted reason', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment] });
    PaymentApi.verify.mockResolvedValue({});
    vi.spyOn(window, 'prompt').mockReturnValue('Blurry screenshot');
    const user = userEvent.setup();
    render(<PaymentVerificationList canVerify={() => true} />);

    await user.click(await screen.findByRole('button', { name: /^reject$/i }));

    await waitFor(() => {
      expect(PaymentApi.verify).toHaveBeenCalledWith('pay1', { approve: false, rejectionReason: 'Blurry screenshot' });
    });
  });

  it('toggles and loads the proof image when "View proof" is clicked', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment] });
    PaymentApi.fetchProofImageObjectUrl.mockResolvedValue('blob:fake-url');
    const user = userEvent.setup();
    render(<PaymentVerificationList canVerify={() => true} />);

    await user.click(await screen.findByRole('button', { name: /view proof/i }));

    expect(await screen.findByRole('img', { name: /payment proof/i })).toHaveAttribute('src', 'blob:fake-url');
    expect(PaymentApi.fetchProofImageObjectUrl).toHaveBeenCalledWith('pay1');
  });

  it('shows an error banner when the list fails to load', async () => {
    PaymentApi.list.mockRejectedValue(new Error('boom'));
    render(<PaymentVerificationList canVerify={() => true} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load payments.');
  });
});
