import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BillingPage from './BillingPage.jsx';
import BillingApi from '../../services/BillingApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/BillingApi.js', () => ({ default: { list: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <BillingPage />
    </MemoryRouter>
  );
}

describe('BillingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('shows an empty state with no statements', async () => {
    BillingApi.list.mockResolvedValue({ soas: [] });
    renderPage();
    expect(await screen.findByText(/no statements yet/i)).toBeInTheDocument();
  });

  it('renders a table row with who it belongs to, formatted amounts and status per statement', async () => {
    BillingApi.list.mockResolvedValue({
      soas: [
        {
          _id: 's1', billingPeriod: '2026-09-01T00:00:00Z', dueDate: '2026-09-11T00:00:00Z', totalAmountDue: 5000, amountPaid: 2000, remainingBalance: 3000, paymentStatus: 'PARTIAL',
          tenantName: 'Juan Cruz', propertyName: 'Sunrise', roomNumber: '101',
        },
      ],
    });
    renderPage();

    const table = await screen.findByRole('table');
    const row = within(table).getAllByRole('row')[1];
    expect(within(row).getByText('Juan Cruz')).toBeInTheDocument();
    expect(within(row).getByText('Sunrise · Room 101')).toBeInTheDocument();
    expect(within(row).getByText('September 2026')).toBeInTheDocument();
    expect(within(row).getByText('₱5,000')).toBeInTheDocument();
    expect(within(row).getByText('₱2,000')).toBeInTheDocument();
    expect(within(row).getByText('₱3,000')).toBeInTheDocument();
    expect(within(row).getByText('Partial')).toBeInTheDocument();
  });

  it('filters statements by status and shows totals', async () => {
    BillingApi.list.mockResolvedValue({
      soas: [
        { _id: 's1', billingPeriod: '2026-09-01', totalAmountDue: 1000, amountPaid: 0, remainingBalance: 1000, paymentStatus: 'OVERDUE', tenantName: 'Ana' },
        { _id: 's2', billingPeriod: '2026-08-01', totalAmountDue: 2000, amountPaid: 2000, remainingBalance: 0, paymentStatus: 'PAID', tenantName: 'Ben' },
      ],
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('₱3,000')).toBeInTheDocument(); // total billed
    const table = screen.getByRole('table');
    expect(within(table).getByText('Ana')).toBeInTheDocument();
    expect(within(table).getByText('Ben')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^overdue/i }));
    expect(within(screen.getByRole('table')).getByText('Ana')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('Ben')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^overdue/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an error banner when statements fail to load', async () => {
    BillingApi.list.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load statements.');
  });
});
