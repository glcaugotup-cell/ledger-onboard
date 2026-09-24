import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssignedRoomsPage from './AssignedRoomsPage.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <AssignedRoomsPage />
    </MemoryRouter>
  );
}

describe('AssignedRoomsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'c1', fullName: 'Caretaker Cruz', role: 'caretaker' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('shows an empty state when there are no approved reservations', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [] });
    renderPage();
    expect(await screen.findByText(/no rooms assigned yet/i)).toBeInTheDocument();
  });

  it('groups approved reservations by room and lists their tenants', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [
        {
          status: 'approved',
          roomId: { _id: 'r1', roomNumber: '101', currentOccupancy: 2, capacity: 4 },
          propertyId: { propertyName: 'Dagupan Demo Boarding House' },
          tenantId: { _id: 't1', fullName: 'Juan Dela Cruz' },
        },
        {
          status: 'approved',
          roomId: { _id: 'r1', roomNumber: '101', currentOccupancy: 2, capacity: 4 },
          propertyId: { propertyName: 'Dagupan Demo Boarding House' },
          tenantId: { _id: 't2', fullName: 'Maria Santos' },
        },
        { status: 'pending', roomId: { _id: 'r2', roomNumber: '102' }, propertyId: {}, tenantId: { _id: 't3', fullName: 'Excluded Tenant' } },
      ],
    });
    renderPage();

    expect(await screen.findByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.queryByText('Excluded Tenant')).not.toBeInTheDocument();
    expect(screen.getByText('2/4 occupied')).toBeInTheDocument();
  });

  it('shows an error banner when the reservation list fails to load', async () => {
    ReservationApi.list.mockRejectedValue(new Error('network down'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your assigned rooms.');
  });
});
