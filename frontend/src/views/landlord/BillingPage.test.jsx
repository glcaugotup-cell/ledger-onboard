import { render, screen } from '@testing-library/react';
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

  it('renders a table row with formatted amounts and status per statement', async () => {
    BillingApi.list.mockResolvedValue({
      soas: [{ _id: 's1', billingPeriod: '2026-09-01', totalAmountDue: 5000, amountPaid: 2000, remainingBalance: 3000, paymentStatus: 'PARTIAL' }],
    });
    renderPage();

    expect(await screen.findByText('₱5,000')).toBeInTheDocument();
    expect(screen.getByText('₱2,000')).toBeInTheDocument();
    expect(screen.getByText('₱3,000')).toBeInTheDocument();
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
  });

  it('shows an error banner when statements fail to load', async () => {
    BillingApi.list.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load statements.');
  });
});
