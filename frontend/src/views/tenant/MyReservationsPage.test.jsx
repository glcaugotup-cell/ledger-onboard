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
// Leaflet needs a real browser; the map dialog only has to receive the right property.
vi.mock('../../components/map/PropertyMap.jsx', () => ({ default: ({ properties, center }) => <div data-testid="property-map">{properties[0].propertyName} at {center.join(',')}</div> }));

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
    // Rule from the user (2026-10-14): the caretaker has their own section with a tap-to-call phone.
    expect(screen.getByText('Carlo Caretaker')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+639170000002' })).toHaveAttribute('href', 'tel:+639170000002');
    expect(screen.getAllByText('Caretaker')).toHaveLength(1);
  });

  describe('reserved room card', () => {
    const reserved = {
      _id: 'res9',
      status: 'approved',
      ...base,
      holdUntil: '2026-10-08',
      propertyId: {
        _id: 'p9', propertyName: 'Dagupan Demo Boarding House',
        address: { street: '123 Rizal St', barangay: 'Bonuan', city: 'Dagupan City', province: 'Pangasinan' },
        locationCoordinates: { lat: 16.0433, lng: 120.3333 },
      },
      landlordContact: { fullName: 'Demo Landlord', email: 'demo.landlord@gmail.com', phone: '+639170000002' },
      caretakerContact: { fullName: 'Demo Caretaker', phone: '+639170000004' },
    };

    it('shows how to visit, the full address, and the landlord and caretaker with tap-to-call phones', async () => {
      ReservationApi.list.mockResolvedValue({ reservations: [reserved] });
      renderPage('/tenant/reservations?reservation=res9');

      expect(await screen.findByText('123 Rizal St, Bonuan, Dagupan City, Pangasinan')).toBeInTheDocument();
      expect(screen.getByText('Visit or move in by Oct 8, 2026. Contact your landlord or caretaker to arrange it.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: '+639170000002' })).toHaveAttribute('href', 'tel:+639170000002');
      expect(screen.getByRole('link', { name: '+639170000004' })).toHaveAttribute('href', 'tel:+639170000004');
      expect(screen.getByRole('link', { name: 'demo.landlord@gmail.com' })).toHaveAttribute('href', 'mailto:demo.landlord@gmail.com');
      expect(screen.getByRole('link', { name: /get directions/i })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=16.0433,120.3333');
    });

    it('opens the boarding house on a map inside the page, with directions from there too', async () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => null);
      ReservationApi.list.mockResolvedValue({ reservations: [reserved] });
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: /show on map/i }));
      const dialog = screen.getByRole('dialog', { name: 'Dagupan Demo Boarding House' });
      expect(within(dialog).getByTestId('property-map')).toHaveTextContent('Dagupan Demo Boarding House at 16.0433,120.3333');
      await user.click(within(dialog).getByRole('button', { name: 'Get directions' }));
      expect(open).toHaveBeenCalledWith('https://www.google.com/maps/dir/?api=1&destination=16.0433,120.3333', '_blank', 'noopener,noreferrer');
      await user.click(within(dialog).getByRole('button', { name: 'Close map' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      open.mockRestore();
    });

    it('pending requests show no address, map or visit note; a reservation without a caretaker asks to contact the landlord', async () => {
      ReservationApi.list.mockResolvedValue({
        reservations: [
          { ...reserved, _id: 'p-1', status: 'pending', landlordContact: { fullName: 'Demo Landlord' }, caretakerContact: null, holdUntil: null },
          { ...reserved, _id: 'r-2', caretakerContact: null, propertyId: { ...reserved.propertyId, _id: 'p10', propertyName: 'No Caretaker House' } },
        ],
      });
      renderPage();

      expect(await screen.findByText('No Caretaker House')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /show on map/i })).toHaveLength(1);
      expect(screen.getAllByText('123 Rizal St, Bonuan, Dagupan City, Pangasinan')).toHaveLength(1);
      expect(screen.getByText('Visit or move in by Oct 8, 2026. Contact your landlord to arrange it.')).toBeInTheDocument();
      expect(screen.queryByText('Caretaker')).not.toBeInTheDocument();
    });
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
