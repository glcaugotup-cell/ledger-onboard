import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PropertyManagePage from './PropertyManagePage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock, navigateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useNotificationsMock: vi.fn(),
  navigateMock: vi.fn(),
}));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/PropertyApi.js', () => ({ default: { getForManagement: vi.fn(), remove: vi.fn(), createRoom: vi.fn(), updateRoom: vi.fn() } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const managementData = {
  property: {
    _id: 'p1',
    propertyName: 'Dagupan Demo Boarding House',
    listingStatus: 'approved',
    address: { street: '123 Main St', barangay: 'Bonuan', city: 'Dagupan' },
  },
  rooms: [{ _id: 'r1', roomNumber: '101', monthlyBaseRent: 2500, currentOccupancy: 1, capacity: 2, status: 'available' }],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/landlord/properties/p1']}>
      <Routes>
        <Route path="/landlord/properties/:id" element={<PropertyManagePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PropertyManagePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('renders the property header and its rooms', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Dagupan Demo Boarding House' })).toBeInTheDocument();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('available')).toBeInTheDocument();
  });

  it('toggles a room to maintenance and back', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    PropertyApi.updateRoom.mockResolvedValue({ room: { ...managementData.rooms[0], status: 'maintenance' } });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /mark maintenance/i }));

    await waitFor(() => {
      expect(PropertyApi.updateRoom).toHaveBeenCalledWith('r1', { status: 'maintenance' });
    });
    expect(await screen.findByRole('button', { name: /mark available/i })).toBeInTheDocument();
  });

  it('adds a new room via the inline form', async () => {
    PropertyApi.getForManagement.mockResolvedValue({ ...managementData, rooms: [] });
    PropertyApi.createRoom.mockResolvedValue({ room: { _id: 'r2', roomNumber: '102', monthlyBaseRent: 3000, currentOccupancy: 0, capacity: 2, status: 'available' } });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/no rooms yet/i);
    await user.type(screen.getByLabelText('Room #'), '102');
    await user.clear(screen.getByLabelText('Capacity'));
    await user.type(screen.getByLabelText('Capacity'), '2');
    await user.type(screen.getByLabelText(/rent \/ slot/i), '3000');
    await user.click(screen.getByRole('button', { name: /add room/i }));

    await waitFor(() => {
      expect(PropertyApi.createRoom).toHaveBeenCalledWith('p1', { roomNumber: '102', capacity: 2, monthlyBaseRent: 3000 });
    });
    expect(await screen.findByText('Room 102')).toBeInTheDocument();
    expect(screen.getByText('Room added.')).toBeInTheDocument();
  });

  it('deletes the property after confirmation and navigates away', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    PropertyApi.remove.mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete property/i }));

    await waitFor(() => {
      expect(PropertyApi.remove).toHaveBeenCalledWith('p1');
      expect(navigateMock).toHaveBeenCalledWith('/landlord/properties');
    });
  });

  it('does not delete when the confirmation is declined', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete property/i }));

    expect(PropertyApi.remove).not.toHaveBeenCalled();
  });
});
