import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyApartmentPage from './MyApartmentPage.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import BillingApi from '../../services/BillingApi.js';
import MaintenanceIssueApi from '../../services/MaintenanceIssueApi.js';
import ReviewApi from '../../services/ReviewApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn(), requestLeave: vi.fn() } }));
vi.mock('../../services/BillingApi.js', () => ({ default: { list: vi.fn(), fetchPaymentQrObjectUrl: vi.fn() } }));
vi.mock('../../services/PaymentApi.js', () => ({ default: { submitQr: vi.fn() } }));
vi.mock('../../services/MaintenanceIssueApi.js', () => ({ default: { list: vi.fn(), getMedia: vi.fn() } }));
vi.mock('../../services/ReviewApi.js', () => ({ default: { listEligible: vi.fn(), submit: vi.fn() } }));

const stay = {
  _id: 'res1', status: 'active', movedInAt: '2026-09-01', moveInDate: '2026-09-01',
  propertyId: { _id: 'p1', propertyName: 'Sunshine Boarding House', address: { street: '1 Main St', barangay: 'Barangay I' } },
  roomId: { roomNumber: '67' },
  landlordContact: { fullName: 'Lara Landlord', email: 'lara@gmail.com', phone: '+639170000001' },
  caretakerContact: { fullName: 'Carlo Caretaker', phone: '+639170000002' },
};
const bill = { _id: 'b1', billingPeriod: '2026-09-01', paymentStatus: 'UNPAID', baseRent: 3000, electricShare: 0, waterShare: 0, previousArrears: 0, totalAmountDue: 3000, amountPaid: 0, remainingBalance: 3000, dueDate: '2026-09-11', propertyName: 'Sunshine Boarding House', roomNumber: '67' };

function renderPage(entry = '/tenant/apartment') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MyApartmentPage />
    </MemoryRouter>
  );
}

describe('MyApartmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', fullName: 'Tina Tenant', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    BillingApi.list.mockResolvedValue({ soas: [bill] });
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [] });
    ReviewApi.listEligible.mockResolvedValue({ eligibleReservations: [] });
  });

  it('shows the current stay with the landlord and caretaker contacts, and billing inside', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [stay] });
    renderPage();
    expect(await screen.findByText('Sunshine Boarding House')).toBeInTheDocument();
    expect(screen.getByText(/Current stay since Sep 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText('Lara Landlord')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+639170000001/ })).toHaveAttribute('href', 'tel:+639170000001');
    expect(screen.getByText(/Caretaker: Carlo Caretaker/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Billing' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Balances to pay')).toBeInTheDocument();
  });

  it('opens the Maintenance issues tab from the link', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [stay] });
    renderPage('/tenant/apartment?tab=issues');
    expect(await screen.findByRole('tab', { name: 'Maintenance issues' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('button', { name: 'Report an issue' })).toBeEnabled();
  });

  it('R12: sends a request to leave after confirmation', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [stay] });
    ReservationApi.requestLeave.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /request to leave/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/message for your landlord/i), 'moving out on Nov 30');
    ReservationApi.list.mockResolvedValue({ reservations: [{ ...stay, leaveRequest: { status: 'pending', requestedAt: '2026-10-04' } }] });
    await user.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(ReservationApi.requestLeave).toHaveBeenCalledWith('res1', 'Moving out on Nov 30'));
    expect(await screen.findByText(/Waiting for your landlord to respond/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /request to leave/i })).not.toBeInTheDocument();
  });

  it('shows a declined request with its reason and lets the tenant ask again', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [{ ...stay, leaveRequest: { status: 'declined', declineReason: 'Contract period has not ended' } }] });
    renderPage();
    expect(await screen.findByText(/declined: Contract period has not ended/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request to leave/i })).toBeInTheDocument();
  });

  it('without a current stay, past bills and past stays stay reachable (read-only), and reporting is off', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [{ ...stay, _id: 'old', status: 'completed', movedOutAt: '2026-09-30' }] });
    renderPage('/tenant/apartment?tab=issues');
    expect(await screen.findByText('No current stay')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Past stays' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Report an issue' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /request to leave/i })).not.toBeInTheDocument();
  });
});
