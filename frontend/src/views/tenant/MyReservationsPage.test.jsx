import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyReservationsPage from './MyReservationsPage.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <MyReservationsPage />
    </MemoryRouter>
  );
}

describe('MyReservationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', fullName: 'Juan Dela Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('shows an empty state with no reservations', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [] });
    renderPage();
    expect(await screen.findByText(/no reservations yet/i)).toBeInTheDocument();
  });

  it('renders a reservation with its property, room, and status', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [
        {
          _id: 'res1',
          status: 'approved',
          propertyId: { propertyName: 'Dagupan Demo Boarding House' },
          roomId: { roomNumber: '101' },
          moveInDate: '2026-10-01',
        },
      ],
    });
    renderPage();

    expect(await screen.findByText('Dagupan Demo Boarding House')).toBeInTheDocument();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
  });

  it('shows the rejection reason only for rejected reservations', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [
        {
          _id: 'res1',
          status: 'rejected',
          rejectionReason: 'Room no longer available',
          propertyId: { propertyName: 'Dagupan Demo Boarding House' },
          roomId: { roomNumber: '101' },
          moveInDate: '2026-10-01',
        },
      ],
    });
    renderPage();
    expect(await screen.findByText('Reason: Room no longer available')).toBeInTheDocument();
  });

  it('shows an error banner when reservations fail to load', async () => {
    ReservationApi.list.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your reservations.');
  });
});
