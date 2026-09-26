import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn(), updateStatus: vi.fn() } }));
vi.mock('../../services/CaretakerApi.js', () => ({ default: { list: vi.fn() } }));

const pendingReservation = {
  _id: 'res1',
  status: 'pending',
  tenantId: { fullName: 'Juan Dela Cruz' },
  propertyId: { propertyName: 'Dagupan Demo Boarding House' },
  roomId: { roomNumber: '101' },
  moveInDate: '2026-10-01',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ReservationsPage />
    </MemoryRouter>
  );
}

describe('ReservationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    CaretakerApi.list.mockResolvedValue({ caretakers: [{ _id: 'ct1', fullName: 'Maria Santos', accountStatus: 'active' }] });
  });

  it('separates pending requests from history', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [pendingReservation, { ...pendingReservation, _id: 'res2', status: 'approved' }],
    });
    renderPage();

    expect(await screen.findByText(/pending requests/i)).toBeInTheDocument();
    expect(screen.getByText(/history/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('approves a pending reservation with an assigned caretaker', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [pendingReservation] });
    ReservationApi.updateStatus.mockResolvedValue({});
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
    ReservationApi.updateStatus.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^approve$/i }));

    await waitFor(() => {
      expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res1', { status: 'approved' });
    });
  });

  it('rejects a pending reservation with a fixed reason', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [pendingReservation] });
    ReservationApi.updateStatus.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^reject$/i }));

    await waitFor(() => {
      expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res1', { status: 'rejected', rejectionReason: 'Not a fit for this room' });
    });
  });

  it('marks an approved reservation as completed', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [{ ...pendingReservation, _id: 'res2', status: 'approved' }] });
    ReservationApi.updateStatus.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /mark completed/i }));

    await waitFor(() => {
      expect(ReservationApi.updateStatus).toHaveBeenCalledWith('res2', { status: 'completed' });
    });
  });
});
