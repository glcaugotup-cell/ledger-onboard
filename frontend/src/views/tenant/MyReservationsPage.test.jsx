import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyReservationsPage from './MyReservationsPage.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import ReviewApi from '../../services/ReviewApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn(), cancel: vi.fn() } }));
vi.mock('../../services/ReviewApi.js', () => ({ default: { listEligible: vi.fn(), submit: vi.fn() } }));

const base = { propertyId: { _id: 'p1', propertyName: 'Dagupan Demo Boarding House' }, roomId: { roomNumber: '101' }, moveInDate: '2026-10-01' };

function renderPage(entry = '/tenant/reservations') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MyReservationsPage />
    </MemoryRouter>
  );
}

describe('MyReservationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', fullName: 'Juan Dela Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    ReviewApi.listEligible.mockResolvedValue({ eligibleReservations: [] });
  });

  it('shows an empty state with no reservations', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [] });
    renderPage();
    expect(await screen.findByText(/no reservations yet/i)).toBeInTheDocument();
  });

  it('renders a reservation with its property, room, and status (approved shows as Reserved)', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [{ _id: 'res1', status: 'approved', ...base }] });
    renderPage();

    expect(await screen.findByText('Dagupan Demo Boarding House')).toBeInTheDocument();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('Reserved')).toBeInTheDocument();
    expect(screen.getByText(/you may move in on Oct 1, 2026/i)).toBeInTheDocument();
  });

  it('shows the rejection reason only for rejected reservations', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [{ _id: 'res1', status: 'rejected', rejectionReason: 'Room no longer available', ...base }],
    });
    renderPage();
    expect(await screen.findByText('Reason: Room no longer available')).toBeInTheDocument();
  });

  it('shows an error banner when reservations fail to load', async () => {
    ReservationApi.list.mockRejectedValue(new Error('boom'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your reservations.');
  });

  it('R9: pins the reserved or current stay above newer requests', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [
        { _id: 'new', status: 'pending', ...base, propertyId: { _id: 'p2', propertyName: 'Newest Request House' } },
        { _id: 'stay', status: 'active', movedInAt: '2026-09-01', ...base, propertyId: { _id: 'p3', propertyName: 'Current Stay House' } },
      ],
    });
    renderPage();
    const pinned = await screen.findByRole('region', { name: 'Your stay' });
    expect(within(pinned).getByText('Current Stay House')).toBeInTheDocument();
    expect(within(pinned).getByText(/Current stay since Sep 1, 2026/)).toBeInTheDocument();
    expect(within(pinned).queryByText('Newest Request House')).not.toBeInTheDocument();
  });

  it('R8: pending cards show the landlord name only; reserved cards show phone and email too', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [
        { _id: 'res1', status: 'pending', ...base, landlordContact: { fullName: 'Lara Landlord' } },
        { _id: 'res2', status: 'approved', ...base, propertyId: { _id: 'p2', propertyName: 'Second House' }, landlordContact: { fullName: 'Lito Landlord', email: 'lito@gmail.com', phone: '+639170000001' }, caretakerContact: { fullName: 'Carlo Caretaker', phone: '+639170000002' } },
      ],
    });
    renderPage();
    expect(await screen.findByText('Lara Landlord')).toBeInTheDocument();
    expect(screen.getByText('Lito Landlord')).toBeInTheDocument();
    expect(screen.getByText('lito@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('+639170000001')).toBeInTheDocument();
    expect(screen.getByText(/Caretaker: Carlo Caretaker/)).toBeInTheDocument();
  });

  it('R6: cancels a pending or reserved request after confirmation; a current stay has no Cancel', async () => {
    ReservationApi.list.mockResolvedValue({
      reservations: [
        { _id: 'res1', status: 'approved', ...base },
        { _id: 'res2', status: 'active', ...base, propertyId: { _id: 'p2', propertyName: 'Stay House' } },
      ],
    });
    ReservationApi.cancel.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    const buttons = await screen.findAllByRole('button', { name: 'Cancel reservation' });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/reserved room will be released/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel reservation' }));
    await waitFor(() => expect(ReservationApi.cancel).toHaveBeenCalledWith('res1'));
    expect(await screen.findByText(/your reservation was cancelled/i)).toBeInTheDocument();
  });

  it('R12: a review link opens the rating prompt, and a rating is required', async () => {
    ReservationApi.list.mockResolvedValue({ reservations: [{ _id: 'res9', status: 'completed', ...base }] });
    ReviewApi.listEligible.mockResolvedValue({ eligibleReservations: [{ _id: 'res9', ...base }] });
    ReviewApi.submit.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage('/tenant/reservations?review=res9');

    const dialog = await screen.findByRole('dialog', { name: 'Rate your stay' });
    await user.click(within(dialog).getByRole('button', { name: 'Submit review' }));
    expect(within(dialog).getByText('Choose a rating from 1 to 5 stars.')).toBeInTheDocument();
    expect(ReviewApi.submit).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('radio', { name: '4 stars' }));
    await user.click(within(dialog).getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(ReviewApi.submit).toHaveBeenCalledWith('p1', { reservationId: 'res9', rating: 4, comment: '' }));
    // Reviews are published at once: the window confirms that, then closes.
    expect(await within(dialog).findByText(/your review is now on the property page/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rate your stay' })).not.toBeInTheDocument());
  });
});
