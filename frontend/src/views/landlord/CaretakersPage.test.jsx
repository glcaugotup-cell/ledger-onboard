import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CaretakersPage from './CaretakersPage.jsx';
import CaretakerApi from '../../services/CaretakerApi.js';
import { ApiClientError } from '../../services/apiClient.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/CaretakerApi.js', () => ({ default: { list: vi.fn(), create: vi.fn(), update: vi.fn(), resendInvitation: vi.fn(), cancelInvitation: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <CaretakersPage />
    </MemoryRouter>
  );
}

async function fillValidForm(user) {
  await user.type(screen.getByLabelText('First name'), 'Pedro');
  await user.type(screen.getByLabelText('Last name'), 'Reyes');
  // The box holds only the Gmail username; "@gmail.com" is a fixed suffix the form adds.
  await user.type(screen.getByLabelText(/email/i), 'pedro.reyes');
  await user.type(screen.getByLabelText(/phone/i), '09171234567');
  await user.selectOptions(screen.getByLabelText('Service barangay'), 'Bonuan Gueset');
}

// The activation code is emailed to the caretaker and never shown to the landlord; the submit button
// reads 'Send invitation' and pending caretakers get 'Send new code'.
describe('CaretakersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    CaretakerApi.list.mockResolvedValue({ caretakers: [] });
  });

  it('lists existing caretakers with their status', async () => {
    CaretakerApi.list.mockResolvedValue({
      caretakers: [{ _id: 'c1', fullName: 'Maria Santos', email: 'maria@gmail.com', phone: '09171234567', accountStatus: 'active' }],
    });
    renderPage();
    expect(await screen.findByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('blocks submission and shows custom messages when fields fail validation', async () => {
    // Non-empty-but-invalid values (native HTML5 required validation would
    // otherwise intercept an empty submit before this form's onSubmit runs —
    // this form has no `noValidate`, unlike RegisterPage's).
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await user.type(screen.getByLabelText('First name'), 'pedro');
    await user.type(screen.getByLabelText('Last name'), 'reyes');
    // Only characters a Gmail username can't contain: the box strips them all, leaving no username.
    await user.type(screen.getByLabelText(/email/i), '#!()');
    expect(screen.getByLabelText(/email/i)).toHaveValue('');
    await user.type(screen.getByLabelText(/phone/i), '12345');
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(CaretakerApi.create).not.toHaveBeenCalled();
    expect(await screen.findByText(/must be a valid @gmail\.com address/i)).toBeInTheDocument();
    expect(screen.getByText(/must be 09xxxxxxxxx/i)).toBeInTheDocument();
  });

  it('submits a valid invite and says the invitation was sent, without showing any code', async () => {
    CaretakerApi.create.mockResolvedValue({ caretaker: { _id: 'c9', fullName: 'Pedro Reyes', email: 'pedro.reyes@gmail.com' }, invitationSent: true, expiresAt: '2026-10-15T04:30:00Z' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => {
      expect(CaretakerApi.create).toHaveBeenCalledWith({
        firstName: 'Pedro',
        lastName: 'Reyes',
        email: 'pedro.reyes@gmail.com',
        phone: '09171234567',
        serviceBarangay: 'Bonuan Gueset',
      });
    });
    expect(await screen.findByText(/invitation has been sent to pedro.reyes@gmail.com\. wait for the caretaker to confirm it/i)).toBeInTheDocument();
    expect(screen.getByText(/if they miss the deadline \(3 days\), send another code if needed/i)).toBeInTheDocument();
    expect(screen.queryByTestId('activation-code')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tells the landlord when the invitation email could not be sent', async () => {
    CaretakerApi.create.mockResolvedValue({ caretaker: { _id: 'c9', fullName: 'Pedro Reyes', email: 'pedro.reyes@gmail.com' }, invitationSent: false, activationCode: 'ABCDE-FGHJK' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(await screen.findByText(/the invitation email couldn't be sent/i)).toBeInTheDocument();
    expect(screen.queryByText('ABCDE-FGHJK')).not.toBeInTheDocument();
  });

  it('requires a service barangay and capitalizes names as they are typed (but not the email)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await user.type(screen.getByLabelText('First name'), "o'connor");
    expect(screen.getByLabelText('First name')).toHaveValue("O'connor");
    await user.type(screen.getByLabelText(/email/i), 'pedro');
    expect(screen.getByLabelText(/email/i)).toHaveValue('pedro');

    await user.click(screen.getByRole('button', { name: /send invitation/i }));
    expect(CaretakerApi.create).not.toHaveBeenCalled();
    expect(screen.getByText('Select the barangay this caretaker works in')).toBeInTheDocument();
    // Submitting normalizes the name the same way the server does.
    expect(screen.getByLabelText('First name')).toHaveValue("O'Connor");
  });

  it('sends a name with an apostrophe (a curly one from a phone keyboard becomes straight)', async () => {
    CaretakerApi.create.mockResolvedValue({ caretaker: { _id: 'c8', email: 'liam.oconnor@gmail.com' }, activationCode: 'ABCDE-FGHJK', expiresAt: '2026-10-15T04:30:00Z' });
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await user.type(screen.getByLabelText('First name'), 'liam');
    await user.type(screen.getByLabelText('Last name'), 'o’connor');
    expect(screen.getByLabelText('Last name')).toHaveValue("O'connor");
    await user.type(screen.getByLabelText(/email/i), 'liam.oconnor');
    await user.type(screen.getByLabelText(/phone/i), '09171234567');
    await user.selectOptions(screen.getByLabelText('Service barangay'), 'Bonuan Gueset');
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    await waitFor(() => expect(CaretakerApi.create).toHaveBeenCalledWith({
      firstName: 'Liam', lastName: "O'Connor", email: 'liam.oconnor@gmail.com', phone: '09171234567', serviceBarangay: 'Bonuan Gueset',
    }));
  });

  it('lets the landlord set an existing caretaker\'s service barangay', async () => {
    CaretakerApi.list.mockResolvedValue({
      caretakers: [{ _id: 'c1', fullName: 'Carlo Cruz', email: 'carlo@gmail.com', phone: '09170000000', accountStatus: 'active', serviceBarangay: null }],
    });
    CaretakerApi.update.mockResolvedValue({
      caretaker: { _id: 'c1', fullName: 'Carlo Cruz', email: 'carlo@gmail.com', phone: '09170000000', accountStatus: 'active', serviceBarangay: 'Lucao' },
    });
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText('Not assigned')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Service barangay for Carlo Cruz'), 'Lucao');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(CaretakerApi.update).toHaveBeenCalledWith('c1', { serviceBarangay: 'Lucao' }));
    // The saved barangay replaces "Not assigned" (the <option> also says Lucao, hence the selector).
    expect(await screen.findByText('Lucao', { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText('Not assigned')).not.toBeInTheDocument();
  });

  it('surfaces a server-side duplicate-email error', async () => {
    CaretakerApi.create.mockRejectedValue(
      new ApiClientError('Validation failed', 'VALIDATION_ERROR', 422, [{ field: 'email', message: 'Email already in use' }])
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send invitation/i }));

    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(await screen.findByText('Email already in use')).toBeInTheDocument();
  });

  it('emails a new activation code only for caretakers who have not activated yet, without showing it', async () => {
    CaretakerApi.list.mockResolvedValue({
      caretakers: [
        { _id: 'c1', fullName: 'Maria Santos', email: 'maria@gmail.com', accountStatus: 'active' },
        { _id: 'c2', fullName: 'Pedro Reyes', email: 'pedro@gmail.com', accountStatus: 'pending_activation' },
      ],
    });
    CaretakerApi.resendInvitation.mockResolvedValue({
      invitationSent: true,
      expiresAt: '2026-10-06T12:41:00Z',
      caretaker: { _id: 'c2', fullName: 'Pedro Reyes', email: 'pedro@gmail.com', accountStatus: 'pending_activation', createdAt: '2026-10-01T02:00:00Z', invitationResentAt: '2026-10-03T12:41:00Z' },
    });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Pedro Reyes');
    const buttons = screen.getAllByRole('button', { name: /send new code/i });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);

    expect(CaretakerApi.resendInvitation).toHaveBeenCalledWith('c2');
    expect(await screen.findByText('A new activation code was emailed to pedro@gmail.com. The previous code no longer works.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Invited Oct 1, 2026 · New code Oct 3, 2026/)).toBeInTheDocument();
  });

  it('shows an error next to the caretaker when the new code email could not be sent', async () => {
    CaretakerApi.list.mockResolvedValue({
      caretakers: [{ _id: 'c2', fullName: 'Pedro Reyes', email: 'pedro@gmail.com', accountStatus: 'pending_activation' }],
    });
    CaretakerApi.resendInvitation.mockResolvedValue({
      invitationSent: false, activationCode: 'KMNPQ-RSTUV',
      caretaker: { _id: 'c2', fullName: 'Pedro Reyes', email: 'pedro@gmail.com', accountStatus: 'pending_activation' },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: /send new code/i }));
    expect(await screen.findByText("The email couldn't be sent. Please try again in a moment.")).toBeInTheDocument();
    expect(screen.queryByText('KMNPQ-RSTUV')).not.toBeInTheDocument();
  });

  it('shows when each caretaker joined, pending invitations first, then newest caretaker on top', async () => {
    CaretakerApi.list.mockResolvedValue({
      caretakers: [
        { _id: 'c1', fullName: 'Older Caretaker', email: 'older@gmail.com', accountStatus: 'active', createdAt: '2026-08-01T02:00:00Z', activatedAt: '2026-08-02T02:00:00Z' },
        { _id: 'c2', fullName: 'Newer Caretaker', email: 'newer@gmail.com', accountStatus: 'active', createdAt: '2026-09-01T02:00:00Z', activatedAt: '2026-09-05T02:00:00Z' },
        { _id: 'c3', fullName: 'Pending Caretaker', email: 'pending@gmail.com', accountStatus: 'pending_activation', createdAt: '2026-07-01T02:00:00Z' },
      ],
    });
    renderPage();

    await screen.findByText('Older Caretaker');
    const names = screen.getAllByText(/Caretaker$/, { selector: 'p' }).map((el) => el.textContent);
    expect(names).toEqual(['Pending Caretaker', 'Newer Caretaker', 'Older Caretaker']);
    expect(screen.getByText('Caretaker since Sep 5, 2026')).toBeInTheDocument();
    expect(screen.getByText('Caretaker since Aug 2, 2026')).toBeInTheDocument();
  });

  it('shows the error when getting a new activation code fails', async () => {
    CaretakerApi.list.mockResolvedValue({
      caretakers: [{ _id: 'c2', fullName: 'Pedro Reyes', email: 'pedro@gmail.com', accountStatus: 'pending_activation' }],
    });
    CaretakerApi.resendInvitation.mockRejectedValue(
      new ApiClientError('Too many requests. Please try again later.', 'RATE_LIMITED', 429)
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /send new code/i }));
    expect(await screen.findByText('Too many requests. Please try again later.')).toBeInTheDocument();
    expect(screen.queryByTestId('activation-code')).not.toBeInTheDocument();
  });

  it('cancels an invitation only for caretakers who have not activated, after confirming', async () => {
    CaretakerApi.list.mockResolvedValue({
      caretakers: [
        { _id: 'c1', fullName: 'Maria Santos', email: 'maria@gmail.com', accountStatus: 'active' },
        { _id: 'c2', fullName: 'Nat Quinto', email: 'nat.quinto@gmail.com', accountStatus: 'pending_activation' },
      ],
    });
    CaretakerApi.cancelInvitation.mockResolvedValue({ cancelled: true });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Nat Quinto');
    const buttons = screen.getAllByRole('button', { name: 'Cancel invitation' });
    expect(buttons).toHaveLength(1);

    await user.click(buttons[0]);
    let dialog = screen.getByRole('dialog', { name: "Cancel Nat Quinto's invitation?" });
    expect(within(dialog).getByText(/You can invite nat.quinto@gmail.com again later/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Keep invitation' }));
    expect(CaretakerApi.cancelInvitation).not.toHaveBeenCalled();
    expect(screen.getByText('Nat Quinto')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel invitation' }));
    dialog = screen.getByRole('dialog', { name: "Cancel Nat Quinto's invitation?" });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel invitation' }));
    await waitFor(() => expect(CaretakerApi.cancelInvitation).toHaveBeenCalledWith('c2'));
    expect(await screen.findByText(/The invitation for Nat Quinto was cancelled/)).toBeInTheDocument();
    expect(screen.queryByText('nat.quinto@gmail.com')).not.toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
  });

  it('keeps the invitation and shows the error when cancelling fails (for example, they just activated)', async () => {
    CaretakerApi.list.mockResolvedValue({
      caretakers: [{ _id: 'c2', fullName: 'Nat Quinto', email: 'nat.quinto@gmail.com', accountStatus: 'pending_activation' }],
    });
    CaretakerApi.cancelInvitation.mockRejectedValue(new ApiClientError('This caretaker has already activated their account', 'ALREADY_ACTIVATED', 409));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Cancel invitation' }));
    const dialog = screen.getByRole('dialog', { name: "Cancel Nat Quinto's invitation?" });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel invitation' }));
    expect(await within(dialog).findByText('This caretaker has already activated their account')).toBeInTheDocument();
    expect(screen.getByText('nat.quinto@gmail.com')).toBeInTheDocument();
  });
});
