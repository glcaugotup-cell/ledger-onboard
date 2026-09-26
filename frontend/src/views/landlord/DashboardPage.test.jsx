import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardPage from './DashboardPage.jsx';
import AnalyticsApi from '../../services/AnalyticsApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/AnalyticsApi.js', () => ({ default: { getLandlordAnalytics: vi.fn() } }));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn().mockResolvedValue({ reservations: [{ _id: 'r1', status: 'pending' }] }) } }));
vi.mock('../../services/PaymentApi.js', () => ({ default: { list: vi.fn().mockResolvedValue({ payments: [] }) } }));

const analytics = {
  occupancyRate: 82,
  occupiedRooms: 41,
  totalRooms: 50,
  collectionRate: 91,
  verifiedPaymentsTotal: 125000,
  outstandingDebt: 8000,
  totalProperties: 4,
  revenueTrend: [{ month: '2026-08', revenue: 15500 }],
  roomStatusBreakdown: { available: 5, occupied: 41, maintenance: 4 },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('renders KPI tiles built from the analytics response', async () => {
    AnalyticsApi.getLandlordAnalytics.mockResolvedValue(analytics);
    renderPage();

    expect(await screen.findByText('82%')).toBeInTheDocument();
    expect(screen.getByText('41/50 rooms occupied')).toBeInTheDocument();
    expect(screen.getByText('91%')).toBeInTheDocument();
    expect(screen.getByText('₱8,000')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('marks outstanding debt as critical when positive', async () => {
    AnalyticsApi.getLandlordAnalytics.mockResolvedValue(analytics);
    renderPage();
    expect(await screen.findByText('₱8,000')).toHaveClass('text-[#d03b3b]');
  });

  it('marks outstanding debt as good when zero', async () => {
    AnalyticsApi.getLandlordAnalytics.mockResolvedValue({ ...analytics, outstandingDebt: 0 });
    renderPage();
    expect(await screen.findByText('₱0')).toHaveClass('text-[#0ca30c]');
  });

  it('lists what needs attention, each linking to the page that handles it', async () => {
    AnalyticsApi.getLandlordAnalytics.mockResolvedValue(analytics);
    renderPage();
    const request = await screen.findByRole('link', { name: /1 reservation request waiting for your answer/i });
    expect(request).toHaveAttribute('href', '/landlord/reservations');
    expect(screen.getByRole('link', { name: /₱8,000 still unpaid/i })).toHaveAttribute('href', '/landlord/billing');
    expect(screen.queryByRole('link', { name: /to verify/i })).not.toBeInTheDocument();
  });

  it('greets the landlord by first name', async () => {
    AnalyticsApi.getLandlordAnalytics.mockResolvedValue(analytics);
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: /, Landlord$/ })).toBeInTheDocument();
  });

  it('shows an error banner when analytics fail to load', async () => {
    AnalyticsApi.getLandlordAnalytics.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load analytics.');
  });
});
