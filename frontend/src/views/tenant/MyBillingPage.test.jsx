import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
vi.mock('../../services/BillingApi.js', () => ({ default: { list: vi.fn() } }));
vi.mock('../../services/PaymentApi.js', () => ({ default: { submit: vi.fn() } }));

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
  });

  it('shows an empty state with no statements', async () => {
    BillingApi.list.mockResolvedValue({ soas: [] });
    renderPage();
    expect(await screen.findByText(/no statements yet/i)).toBeInTheDocument();
  });

  it('renders the SOA breakdown and a Pay via GCash button when a balance is owed', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    renderPage();

    expect(await screen.findByText('UNPAID')).toBeInTheDocument();
    expect(screen.getByText('₱2,900')).toBeInTheDocument();
    expect(screen.getByText('₱2,400')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /pay via gcash/i })).toBeInTheDocument();
  });

  it('hides the payment button once the statement is fully paid', async () => {
    BillingApi.list.mockResolvedValue({ soas: [{ ...unpaidSoa, paymentStatus: 'PAID', remainingBalance: 0, amountPaid: 2900 }] });
    renderPage();
    await screen.findByText('PAID');
    expect(screen.queryByRole('button', { name: /pay via gcash/i })).not.toBeInTheDocument();
  });

  it('rejects an amount above the remaining balance before sending', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /pay via gcash/i }));
    const amount = screen.getByLabelText(/amount/i);
    await user.clear(amount);
    await user.type(amount, '5000');
    await user.click(screen.getByRole('button', { name: /submit proof of payment/i }));

    expect(screen.getByText(/cannot be more than the remaining balance of ₱2,400/)).toBeInTheDocument();
    expect(PaymentApi.submit).not.toHaveBeenCalled();
  });

  it('never calls the API when no screenshot is attached', async () => {
    // The file input carries `required` and this form has no `noValidate`,
    // so — same as a real browser — a plain submit click is blocked by
    // native constraint validation before onSubmit's own `if (!file)` guard
    // ever runs. The outward guarantee (no API call) is what matters here.
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /pay via gcash/i }));
    await user.click(screen.getByRole('button', { name: /submit proof of payment/i }));

    expect(PaymentApi.submit).not.toHaveBeenCalled();
  });

  it('submits payment proof as multipart form data with the fixed method', async () => {
    BillingApi.list.mockResolvedValue({ soas: [unpaidSoa] });
    PaymentApi.submit.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /pay via gcash/i }));
    const file = new File(['fake-image-bytes'], 'gcash.png', { type: 'image/png' });
    const fileInput = screen.getByLabelText(/gcash screenshot/i);
    await user.upload(fileInput, file);
    // jsdom doesn't reliably clear a required file input's validity state
    // after user-event sets its `files`, so dispatch the submit directly
    // rather than clicking the button through native constraint validation.
    fireEvent.submit(fileInput.closest('form'));

    await waitFor(() => {
      expect(PaymentApi.submit).toHaveBeenCalledTimes(1);
    });
    const [formData] = PaymentApi.submit.mock.calls[0];
    expect(formData.get('soaId')).toBe('s1');
    expect(formData.get('paymentMethod')).toBe('GCASH_SCREENSHOT');
    expect(formData.get('proofImage').name).toBe('gcash.png');
    expect(await screen.findByText(/awaiting verification/i)).toBeInTheDocument();
  });
});
