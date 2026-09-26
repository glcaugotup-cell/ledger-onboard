import { render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByText('₱2,000 — Cash on site')).toBeInTheDocument();
  });

  it('splits payments into pending and history sections', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment, reviewedPayment] });
    render(<PaymentVerificationList canVerify={() => true} />);
    expect(await screen.findByText('₱1,500 — GCash')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('shows who paid and which bill the payment is for', async () => {
    PaymentApi.list.mockResolvedValue({
      payments: [{ ...pendingPayment, tenantName: 'Tina Cruz', billingPeriod: '2026-09-01T00:00:00Z', propertyName: 'Sunrise', roomNumber: '101' }],
    });
    render(<PaymentVerificationList canVerify={() => true} />);
    expect(await screen.findByText('Tina Cruz — September 2026 bill — Sunrise · Room 101')).toBeInTheDocument();
  });

  it('hides verify/reject actions when canVerify returns false', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment] });
    render(<PaymentVerificationList canVerify={() => false} />);
    await screen.findByText('₱1,500 — GCash');
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

  it('rejects a payment with the reason typed in the dialog', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment] });
    PaymentApi.verify.mockResolvedValue({});
    const user = userEvent.setup();
    render(<PaymentVerificationList canVerify={() => true} />);

    await user.click(await screen.findByRole('button', { name: /^reject$/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), 'blurry screenshot');
    await user.click(within(dialog).getByRole('button', { name: 'Reject payment' }));

    await waitFor(() => {
      expect(PaymentApi.verify).toHaveBeenCalledWith('pay1', { approve: false, rejectionReason: 'Blurry screenshot' });
    });
  });

  it('cancelling the rejection dialog leaves the payment pending', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [pendingPayment] });
    const user = userEvent.setup();
    render(<PaymentVerificationList canVerify={() => true} />);

    await user.click(await screen.findByRole('button', { name: /^reject$/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(PaymentApi.verify).not.toHaveBeenCalled();
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
