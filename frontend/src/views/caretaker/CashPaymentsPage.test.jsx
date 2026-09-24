import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CashPaymentsPage from './CashPaymentsPage.jsx';
import BillingApi from '../../services/BillingApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/BillingApi.js', () => ({ default: { list: vi.fn() } }));
vi.mock('../../services/PaymentApi.js', () => ({ default: { list: vi.fn(), submit: vi.fn(), verify: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <CashPaymentsPage />
    </MemoryRouter>
  );
}

describe('CashPaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'c1', fullName: 'Caretaker Cruz', role: 'caretaker' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    PaymentApi.list.mockResolvedValue({ payments: [] });
  });

  it('lists statements of account with a remaining balance in the select', async () => {
    BillingApi.list.mockResolvedValue({
      soas: [
        { _id: 's1', billingPeriod: '2026-09-01', remainingBalance: 1500 },
        { _id: 's2', billingPeriod: '2026-08-01', remainingBalance: 0 },
      ],
    });
    renderPage();

    await screen.findByText(/select a statement/i);
    expect(screen.getByText(/balance ₱1,500/)).toBeInTheDocument();
    expect(screen.queryByText(/balance ₱0/)).not.toBeInTheDocument();
  });

  it('submits a cash payment as multipart form data with the fixed method', async () => {
    BillingApi.list.mockResolvedValue({ soas: [{ _id: 's1', billingPeriod: '2026-09-01', remainingBalance: 1500 }] });
    PaymentApi.submit.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText(/statement of account/i), 's1');
    await user.type(screen.getByLabelText(/amount collected/i), '1500');
    await user.click(screen.getByRole('button', { name: /log cash payment/i }));

    await waitFor(() => {
      expect(PaymentApi.submit).toHaveBeenCalledTimes(1);
    });
    const [formData] = PaymentApi.submit.mock.calls[0];
    expect(formData.get('soaId')).toBe('s1');
    expect(formData.get('amount')).toBe('1500');
    expect(formData.get('paymentMethod')).toBe('CASH_ON_SITE');
    expect(await screen.findByText(/cash payment logged/i)).toBeInTheDocument();
  });

  it('shows an error message when logging the cash payment fails', async () => {
    BillingApi.list.mockResolvedValue({ soas: [{ _id: 's1', billingPeriod: '2026-09-01', remainingBalance: 1500 }] });
    PaymentApi.submit.mockRejectedValue(new Error('Statement already settled'));
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText(/statement of account/i), 's1');
    await user.type(screen.getByLabelText(/amount collected/i), '1500');
    await user.click(screen.getByRole('button', { name: /log cash payment/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Statement already settled');
  });
});
