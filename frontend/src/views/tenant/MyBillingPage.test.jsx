import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyBillingPage from './MyBillingPage.jsx';
import BillingApi from '../../services/BillingApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/BillingApi.js', () => ({ default: { list: vi.fn(), fetchPaymentQrObjectUrl: vi.fn() } }));
vi.mock('../../services/PaymentApi.js', () => ({ default: { submit: vi.fn(), submitQr: vi.fn() } }));

const unpaidSoa = {
  _id: 's1',
  billingPeriod: '2026-09-01',
  paymentStatus: 'UNPAID',
  baseRent: 2500,
  electricShare: 300,
  waterShare: 100,
  previousArrears: 0,
  totalAmountDue: 2900,
  amountPaid: 500,
  remainingBalance: 2400,
  dueDate: '2026-09-15',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <MyBillingPage />
    </MemoryRouter>
  );
}

describe('MyBillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', fullName: 'Juan Dela Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    // Tenants pay by scanning their landlord's GCash QR, fetched privately per statement.
    BillingApi.fetchPaymentQrObjectUrl.mockResolvedValue('blob:landlord-qr');
    URL.revokeObjectURL = vi.fn();
  });

  it('shows an empty state with no statements', async () => {
    BillingApi.list.mockResolvedValue({ soas: [] });
    renderPage();
    expect(await screen.findByText(/no statements yet/i)).toBeInTheDocument();
  });

  it('renders the SOA breakdown and a Pay now button when a balance is owed', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    renderPage();

    const card = await screen.findByRole('article', { name: 'September 2026 statement' });
    expect(within(card).getByText('Unpaid')).toBeInTheDocument();
    expect(within(card).getByText('₱2,900')).toBeInTheDocument();
    expect(within(card).getByText('₱2,400')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeInTheDocument();
  });

  it('summarizes the total balance and the next due date', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa, { ...unpaidSoa, _id: 's0', billingPeriod: '2026-08-01', paymentStatus: 'PAID', remainingBalance: 0 }] });
    renderPage();
    const tile = (await screen.findByText('Total balance')).closest('div.rounded-xl');
    expect(within(tile).getByText('₱2,400')).toBeInTheDocument();
    expect(within(tile).getByText('across 1 statement')).toBeInTheDocument();
    expect(within(screen.getByText('Next due').closest('div.rounded-xl')).getByText('Sep 15, 2026')).toBeInTheDocument();
  });

  it('hides the payment button once the statement is fully paid', async () => {
    BillingApi.list.mockResolvedValue({ soas: [{ ...unpaidSoa, paymentStatus: 'PAID', remainingBalance: 0, amountPaid: 2900 }] });
    renderPage();
    await screen.findByText('Paid');
    expect(screen.queryByRole('button', { name: /pay now/i })).not.toBeInTheDocument();
  });

  it('rejects an amount above the remaining balance before sending', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Pay now' }));
    await screen.findByRole('img', { name: /landlord gcash payment qr code/i });
    const amount = screen.getByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, '5000');
    await user.type(screen.getByLabelText(/gcash transaction reference/i), 'ABC12345');
    await user.click(screen.getByRole('button', { name: /submit payment for verification/i }));

    expect(screen.getByText(/cannot be more than the remaining balance of ₱2,400/)).toBeInTheDocument();
    expect(PaymentApi.submitQr).not.toHaveBeenCalled();
  });

  it('requires the GCash transaction reference before sending', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Pay now' }));
    await screen.findByRole('img', { name: /landlord gcash payment qr code/i });
    await user.click(screen.getByRole('button', { name: /submit payment for verification/i }));

    expect(screen.getByText('Enter the GCash transaction reference after paying.')).toBeInTheDocument();
    expect(PaymentApi.submitQr).not.toHaveBeenCalled();
  });

  it('submits a GCash QR payment with its transaction reference', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    PaymentApi.submitQr.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Pay now' }));
    expect(await screen.findByRole('img', { name: /landlord gcash payment qr code/i })).toHaveAttribute('src', 'blob:landlord-qr');
    expect(BillingApi.fetchPaymentQrObjectUrl).toHaveBeenCalledWith('s1');
    await user.type(screen.getByLabelText(/gcash transaction reference/i), 'ABC12345');
    await user.click(screen.getByRole('button', { name: /submit payment for verification/i }));

    await waitFor(() => {
      expect(PaymentApi.submitQr).toHaveBeenCalledWith({ soaId: 's1', amount: '2400', paymentMethod: 'GCASH_QR', referenceNumber: 'ABC12345' });
    });
    expect(PaymentApi.submit).not.toHaveBeenCalled();
    expect(await screen.findByText(/awaiting verification/i)).toBeInTheDocument();
  });

  it('tells the tenant when the landlord has no GCash QR yet and blocks submitting', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    BillingApi.fetchPaymentQrObjectUrl.mockRejectedValue(new Error('PAYMENT_QR_NOT_FOUND'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Pay now' }));
    expect(await screen.findByText(/has not uploaded a GCash QR code yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit payment for verification/i })).toBeDisabled();
    expect(PaymentApi.submitQr).not.toHaveBeenCalled();
  });
});
