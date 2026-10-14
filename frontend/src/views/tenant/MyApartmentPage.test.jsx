import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MyApartmentPage from './MyApartmentPage.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import BillingApi from '../../services/BillingApi.js';
import MaintenanceIssueApi from '../../services/MaintenanceIssueApi.js';
import PaymentApi from '../../services/PaymentApi.js';
import ReviewApi from '../../services/ReviewApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn(), requestLeave: vi.fn() } }));
vi.mock('../../services/BillingApi.js', () => ({ default: { list: vi.fn(), fetchPaymentQrObjectUrl: vi.fn() } }));
vi.mock('../../services/PaymentApi.js', () => ({ default: { submitQr: vi.fn() } }));
vi.mock('../../services/MaintenanceIssueApi.js', () => ({ default: { list: vi.fn(), getMedia: vi.fn(), confirm: vi.fn() } }));
vi.mock('../../services/ReviewApi.js', () => ({ default: { listEligible: vi.fn(), submit: vi.fn(), listMine: vi.fn(), update: vi.fn(), remove: vi.fn() } }));

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
    ReviewApi.listMine.mockResolvedValue({ reviews: [] });
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
    // The button is drawn disabled until the tab's data loads; the empty state appears in the same update.
    expect(await screen.findByText('No maintenance issues')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report an issue' })).toBeEnabled();
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
    expect(await screen.findByText('No maintenance issues')).toBeInTheDocument(); // the tab has loaded
    expect(screen.getByRole('button', { name: 'Report an issue' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /request to leave/i })).not.toBeInTheDocument();
  });

  describe('reviews of past stays', () => {
    const past = { ...stay, _id: 'old', status: 'completed', movedOutAt: '2026-09-30' };
    const review = { _id: 'rev1', reservationId: 'old', rating: 2, comment: 'Water was often off.', status: 'APPROVED' };

    it('shows the review with its status and lets the tenant edit the stars and comment', async () => {
      ReservationApi.list.mockResolvedValue({ reservations: [past] });
      ReviewApi.listMine.mockResolvedValue({ reviews: [review] });
      ReviewApi.update.mockResolvedValue({ review: { ...review, rating: 4 } });
      const user = userEvent.setup();
      renderPage();

      expect(await screen.findByRole('img', { name: 'Your rating: 2 out of 5 stars' })).toBeInTheDocument();
      expect(screen.getByText('Shown on the property page')).toBeInTheDocument();
      expect(screen.getByText('Water was often off.')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Edit review' }));
      await user.click(screen.getByRole('radio', { name: '4 stars' }));
      const comment = screen.getByLabelText('Review comment');
      await user.clear(comment);
      await user.type(comment, 'fixed after we talked');
      await user.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(ReviewApi.update).toHaveBeenCalledWith('rev1', { rating: 4, comment: 'Fixed after we talked' }));
      expect(await screen.findByText(/your review was updated/i)).toBeInTheDocument();
      expect(ReviewApi.listMine).toHaveBeenCalledTimes(2);
    });

    it('deletes the review only after confirmation', async () => {
      ReservationApi.list.mockResolvedValue({ reservations: [past] });
      ReviewApi.listMine.mockResolvedValue({ reviews: [review] });
      ReviewApi.remove.mockResolvedValue({});
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole('button', { name: 'Delete review' }));
      const dialog = screen.getByRole('dialog', { name: /delete your review/i });
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      expect(ReviewApi.remove).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Delete review' }));
      ReviewApi.listMine.mockResolvedValue({ reviews: [] });
      await user.click(within(screen.getByRole('dialog', { name: /delete your review/i })).getByRole('button', { name: 'Delete review' }));
      await waitFor(() => expect(ReviewApi.remove).toHaveBeenCalledWith('rev1'));
      expect(await screen.findByRole('button', { name: 'Rate this stay' })).toBeInTheDocument();
    });

    it('a stay without a review can be rated from here; a hidden review shows the admin reason', async () => {
      ReservationApi.list.mockResolvedValue({ reservations: [past, { ...past, _id: 'old2', propertyId: { _id: 'p2', propertyName: 'Riverside Dorm' } }] });
      ReviewApi.listMine.mockResolvedValue({ reviews: [{ ...review, reservationId: 'old2', status: 'HIDDEN', moderationReason: 'Contains a phone number' }] });
      ReviewApi.submit.mockResolvedValue({ review: { _id: 'rev2' } });
      const user = userEvent.setup();
      renderPage();

      expect(await screen.findByText('Hidden by an admin')).toBeInTheDocument();
      expect(screen.getByText('Reason: Contains a phone number')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Rate this stay' }));
      await user.click(screen.getByRole('radio', { name: '5 stars' }));
      await user.click(screen.getByRole('button', { name: 'Submit review' }));
      await waitFor(() => expect(ReviewApi.submit).toHaveBeenCalledWith('p1', { reservationId: 'old', rating: 5, comment: '' }));
    });

    it('an older review saved before reviews were published right away is shown, not waiting for an admin', async () => {
      ReservationApi.list.mockResolvedValue({ reservations: [past] });
      ReviewApi.listMine.mockResolvedValue({ reviews: [{ ...review, status: 'PENDING' }] });
      renderPage();

      expect(await screen.findByText('Shown on the property page')).toBeInTheDocument();
      expect(screen.queryByText(/waiting for an admin/i)).not.toBeInTheDocument();
    });
  });

  // Rule from the user (2026-10-15): after moving out, a stay's balance and issues live on its past-stay card.
  describe('after moving out', () => {
    const current = { ...stay, roomId: { _id: 'r1', roomNumber: '67' } };
    const past = {
      _id: 'old1', status: 'completed', movedInAt: '2026-06-01', moveInDate: '2026-06-01', movedOutAt: '2026-09-15',
      propertyId: { _id: 'p9', propertyName: 'Riverside Dorm' }, roomId: { _id: 'r9', roomNumber: '12' },
      pastStayBalance: { soaId: 'b9', remainingBalance: 1500, billingPeriod: '2026-09-01', dueDate: '2026-09-11', pendingPayment: false },
    };
    const currentBill = { ...bill, _id: 'b1', roomId: 'r1', billingPeriod: '2026-10-01', propertyName: 'Sunshine Boarding House' };
    const pastBill = { ...bill, _id: 'b9', roomId: 'r9', billingPeriod: '2026-09-01', remainingBalance: 1500, totalAmountDue: 1500, propertyName: 'Riverside Dorm', roomNumber: '12' };
    const pastCard = async () => (await screen.findByText('Riverside Dorm · Room 12')).closest('[id="stay-old1"]');

    it('shows the balance on the past-stay card and pays it there; the Billing tab only shows the current stay', async () => {
      ReservationApi.list.mockResolvedValue({ reservations: [current, past] });
      BillingApi.list.mockResolvedValue({ soas: [currentBill, pastBill] });
      BillingApi.fetchPaymentQrObjectUrl.mockResolvedValue('blob:qr');
      PaymentApi.submitQr.mockResolvedValue({});
      const user = userEvent.setup();
      renderPage();

      const card = await pastCard();
      expect(within(card).getByText('Balance to pay')).toBeInTheDocument();
      expect(within(card).getByText('₱1,500')).toBeInTheDocument();
      expect(within(card).getByText(/From your September 2026 bill/)).toBeInTheDocument();
      const panel = screen.getByRole('tabpanel');
      await within(panel).findByText('Balances to pay');
      expect(within(panel).queryByText(/Riverside Dorm/)).not.toBeInTheDocument();

      await user.click(within(card).getByRole('button', { name: 'Pay balance' }));
      expect(BillingApi.fetchPaymentQrObjectUrl).toHaveBeenCalledWith('b9');
      await within(card).findByAltText('Landlord GCash payment QR code');
      await user.type(within(card).getByLabelText(/GCash transaction reference/), '1234567890');
      const loadsBefore = ReservationApi.list.mock.calls.length;
      await user.click(within(card).getByRole('button', { name: /submit payment/i }));
      await waitFor(() => expect(PaymentApi.submitQr).toHaveBeenCalledWith(expect.objectContaining({ soaId: 'b9', amount: '1500', referenceNumber: '1234567890' })));
      expect(await within(card).findByText(/You will be notified here in the app/)).toBeInTheDocument();
      // The stays reload, so the card can show the payment as being verified.
      expect(ReservationApi.list.mock.calls.length).toBe(loadsBefore + 1);
    });

    it('a payment being verified hides Pay balance; a stay with nothing owed says so', async () => {
      ReservationApi.list.mockResolvedValue({
        reservations: [
          { ...past, pastStayBalance: { ...past.pastStayBalance, pendingPayment: true } },
          { ...past, _id: 'old2', propertyId: { _id: 'p8', propertyName: 'Bonuan Bedspace' }, pastStayBalance: null },
        ],
      });
      BillingApi.list.mockResolvedValue({ soas: [pastBill] });
      renderPage();

      const card = await pastCard();
      expect(within(card).getByText('Your payment is being verified by your landlord.')).toBeInTheDocument();
      expect(within(card).queryByRole('button', { name: 'Pay balance' })).not.toBeInTheDocument();
      expect(screen.getByText('No balance left for this stay.')).toBeInTheDocument();
      // Without a current stay the Billing tab points to the cards below.
      expect(await screen.findByText(/Balances from past stays are on their cards below/)).toBeInTheDocument();
    });

    it("a past stay's issues show on its card (still confirmable); the issues tab shows the current stay only", async () => {
      const pastIssue = { _id: 'i9', reservationId: 'old1', status: 'awaiting_confirmation', category: 'Plumbing', urgency: 'medium', description: 'barado po yung cr', roomId: { roomNumber: '12' }, propertyId: { propertyName: 'Riverside Dorm' }, createdAt: '2026-08-04', resolutionNotes: 'Unclogged the drain' };
      const currentIssue = { ...pastIssue, _id: 'i1', reservationId: 'res1', status: 'pending', category: 'Electrical', description: 'no power', roomId: { roomNumber: '67' } };
      ReservationApi.list.mockResolvedValue({ reservations: [current, past] });
      MaintenanceIssueApi.list.mockResolvedValue({ issues: [pastIssue, currentIssue] });
      MaintenanceIssueApi.confirm.mockResolvedValue({});
      const user = userEvent.setup();
      renderPage('/tenant/apartment?tab=issues');

      const card = await pastCard();
      expect(await within(card).findByText('Maintenance issues from this stay')).toBeInTheDocument();
      expect(within(card).getByText('barado po yung cr')).toBeInTheDocument();
      const panel = screen.getByRole('tabpanel');
      expect(await within(panel).findByText('no power')).toBeInTheDocument();
      expect(within(panel).queryByText('barado po yung cr')).not.toBeInTheDocument();

      await user.click(within(card).getByRole('button', { name: 'Confirm solved' }));
      await waitFor(() => expect(MaintenanceIssueApi.confirm).toHaveBeenCalledWith('i9', true));
    });
  });
});
