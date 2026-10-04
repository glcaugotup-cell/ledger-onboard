import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReservationsPage from './ReservationsPage.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import CaretakerApi from '../../services/CaretakerApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn(), updateStatus: vi.fn(), decideLeave: vi.fn(), reassignCaretaker: vi.fn() } }));
vi.mock('../../services/CaretakerApi.js', () => ({ default: { list: vi.fn() } }));

const pendingReservation = {
  _id: 'res1',
  status: 'pending',
  tenantId: { fullName: 'Juan Dela Cruz', phone: '+639171234567', email: 'juan@gmail.com' },
  propertyId: { propertyName: 'Dagupan Demo Boarding House' },
  roomId: { roomNumber: '101' },
  moveInDate: '2026-10-01',
};
// Approved = "Reserved": the slot is held until the move-in is confirmed.
const reserved = { ...pendingReservation, _id: 'res2', status: 'approved', holdUntil: '2026-10-06', today: '2026-10-04' };
const current = { ...pendingReservation, _id: 'res3', status: 'active', movedInAt: '2026-10-01', outstandingBalance: 0 };

function renderPage(user = { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord', hasPaymentQr: true }) {
  useAuthMock.mockReturnValue(mockAuthValue({ user }));
  return render(
    <MemoryRouter>
      <ReservationsPage />
    </MemoryRouter>
  );
}

describe('ReservationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    CaretakerApi.list.mockResolvedValue({ caretakers: [{ _id: 'ct1', fullName: 'Maria Santos', accountStatus: 'active' }] });
    ReservationApi.updateStatus.mockResolvedValue({});
    ReservationApi.decideLeave.mockResolvedValue({});
  });

  it('groups requests, tenants awaiting move-in, current tenants and history', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [pendingReservation, reserved, current, { ...pendingReservation, _id: 'res4', status: 'completed' }],
    });
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Reservation requests' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Awaiting move-in' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Current tenants' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm move-in' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark moved out' })).toBeInTheDocument();
    expect(screen.getByText('Reserved')).toBeInTheDocument();
    // Tenant contact shown to the landlord.
    expect(screen.getAllByText('+639171234567').length).toBeGreaterThan(0);
  });

  it('approves a pending reservation with an assigned caretaker', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [pendingReservation] });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByRole('combobox'), 'ct1');
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => {
      expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res1', { status: 'approved', caretakerAssignedId: 'ct1' });
    });
  });

  it('approves without a caretaker when none is assigned', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [pendingReservation] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^approve$/i }));

    await waitFor(() => {
      expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res1', { status: 'approved' });
    });
  });

  it('rejects a pending reservation with a fixed reason', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [pendingReservation] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^reject$/i }));

    await waitFor(() => {
      expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res1', { status: 'rejected', rejectionReason: 'Not a fit for this room' });
    });
  });

  it('confirms a move-in after the landlord confirms the dialog', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [reserved] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Confirm move-in' }));
    expect(ReservationApi.updateStatus).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm move-in' }));
    await waitFor(() => expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res2', { status: 'active' }));
  });

  it('only allows a no-show after the hold period ends', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [reserved] });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Mark no-show' })).toBeDisabled();
    expect(screen.getByText(/You can mark a no-show after Oct 6, 2026/)).toBeInTheDocument();
  });

  it('marks a no-show once the hold has passed', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [{ ...reserved, today: '2026-10-07' }] });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Mark no-show' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark no-show' }));
    await waitFor(() => expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res2', { status: 'no_show' }));
  });

  it('marks a current tenant as moved out', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [current] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Mark moved out' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Mark moved out' }));
    await waitFor(() => expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res3', { status: 'completed' }));
  });

  it('shows a request to leave with the balance, and approving with a balance needs an explicit confirmation', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [{ ...current, outstandingBalance: 1200, leaveRequest: { status: 'pending', requestedAt: '2026-10-03', note: 'Graduating' } }] });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/Outstanding balance: ₱1,200/)).toBeInTheDocument();
    expect(screen.getByText('“Graduating”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve request' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/still owes ₱1,200/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /approve with ₱1,200 owed/i }));
    await waitFor(() => expect(ReservationApi.decideLeave).toHaveBeenCalledWith('res3', { decision: 'approve', acknowledgeBalance: true }));
  });

  it('declining a request to leave needs a reason', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [{ ...current, leaveRequest: { status: 'pending', requestedAt: '2026-10-03' } }] });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Decline' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Decline request' }));
    expect(ReservationApi.decideLeave).not.toHaveBeenCalled();
    await user.click(within(dialog).getByLabelText('Contract period has not ended'));
    await user.click(within(dialog).getByRole('button', { name: 'Decline request' }));
    await waitFor(() => expect(ReservationApi.decideLeave).toHaveBeenCalledWith('res3', { decision: 'decline', reason: 'Contract period has not ended' }));
  });

  it('reminds a landlord without a GCash QR to upload one before confirming a move-in', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [reserved] });
    renderPage({ _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord', hasPaymentQr: false });
    expect(await screen.findByText(/before confirming a move-in/i)).toBeInTheDocument();
  });
});
