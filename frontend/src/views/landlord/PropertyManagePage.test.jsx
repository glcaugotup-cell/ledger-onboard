import { render, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('../../services/PropertyApi.js', () => ({ default: { getForManagement: vi.fn(), remove: vi.fn(), createRoom: vi.fn(), updateRoom: vi.fn(), listCaretakerSuggestions: vi.fn(), assignCaretaker: vi.fn() } }));
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
    PropertyApi.listCaretakerSuggestions.mockResolvedValue({ propertyBarangay: 'Bonuan', caretakers: [] });
  });

  it('renders the property header and its rooms', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Dagupan Demo Boarding House' })).toBeInTheDocument();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
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

  it('rejects invalid room values before sending', async () => {
    PropertyApi.getForManagement.mockResolvedValue({ ...managementData, rooms: [] });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/no rooms yet/i);
    await user.clear(screen.getByLabelText('Capacity'));
    await user.type(screen.getByLabelText('Capacity'), '0');
    await user.click(screen.getByRole('button', { name: /add room/i }));

    expect(PropertyApi.createRoom).not.toHaveBeenCalled();
    expect(screen.getByText('Room number is required')).toBeInTheDocument();
    expect(screen.getByText('Capacity must be a whole number from 1 to 50')).toBeInTheDocument();
    expect(screen.getByText('Rent must be a number from 0 to 1,000,000')).toBeInTheDocument();
  });

  it('deletes the property only after confirming in the dialog, then navigates away', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    PropertyApi.remove.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete property/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/kept on record, not erased/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete property' }));

    await waitFor(() => {
      expect(PropertyApi.remove).toHaveBeenCalledWith('p1');
      expect(navigateMock).toHaveBeenCalledWith('/landlord/properties');
    });
  });

  it('shows the reason in the dialog and stays on the page when deletion is refused (current tenants)', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    PropertyApi.remove.mockRejectedValue(
      Object.assign(new Error('This property still has 1 current tenant. Complete or cancel their reservations before deleting it.'), {
        code: 'PROPERTY_HAS_TENANTS',
      })
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete property/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete property' }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(/still has 1 current tenant/i);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
  });

  it('does not delete when the dialog is cancelled', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /delete property/i }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(PropertyApi.remove).not.toHaveBeenCalled();
  });

  it('suggests caretakers from the same barangay first, with the reason, and assigns only after confirmation', async () => {
    PropertyApi.getForManagement.mockResolvedValue(managementData);
    PropertyApi.listCaretakerSuggestions.mockResolvedValue({
      propertyBarangay: 'Bonuan Gueset',
      caretakers: [
        { _id: 'c1', fullName: 'Near Cruz', suitable: true, assigned: false, matchReason: 'Works in Bonuan Gueset, the same barangay as this property' },
        { _id: 'c2', fullName: 'Far Reyes', suitable: false, assigned: false, matchReason: 'Works in Lucao, not Bonuan Gueset' },
      ],
    });
    PropertyApi.assignCaretaker.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    const near = (await screen.findByText('Near Cruz')).closest('li');
    expect(within(near).getByText('Suitable')).toBeInTheDocument();
    expect(within(near).getByText(/same barangay as this property/)).toBeInTheDocument();
    const far = screen.getByText('Far Reyes').closest('li');
    expect(within(far).queryByText('Suitable')).not.toBeInTheDocument();
    expect(within(far).getByText('Works in Lucao, not Bonuan Gueset')).toBeInTheDocument();

    await user.click(within(near).getByRole('button', { name: 'Assign' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(PropertyApi.assignCaretaker).not.toHaveBeenCalled();

    await user.click(within(near).getByRole('button', { name: 'Assign' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Assign caretaker' }));
    await waitFor(() => expect(PropertyApi.assignCaretaker).toHaveBeenCalledWith('p1', 'c1'));
    expect(await screen.findByText('Near Cruz is now assigned to this property.')).toBeInTheDocument();
  });
});
