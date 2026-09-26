import { render, screen, waitFor } from '@testing-library/react';
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
vi.mock('../../services/CaretakerApi.js', () => ({ default: { list: vi.fn(), create: vi.fn(), update: vi.fn() } }));

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
  await user.type(screen.getByLabelText(/email/i), 'pedro.reyes@gmail.com');
  await user.type(screen.getByLabelText(/phone/i), '09171234567');
  await user.selectOptions(screen.getByLabelText('Service barangay'), 'Bonuan Gueset');
}

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
    await user.type(screen.getByLabelText(/email/i), 'pedro@yahoo.com');
    await user.type(screen.getByLabelText(/phone/i), '12345');
    await user.click(screen.getByRole('button', { name: /send activation invite/i }));

    expect(CaretakerApi.create).not.toHaveBeenCalled();
    expect(await screen.findByText(/must be a valid @gmail\.com address/i)).toBeInTheDocument();
    expect(screen.getByText(/must be 09xxxxxxxxx/i)).toBeInTheDocument();
  });

  it('submits a valid invite and shows a confirmation message', async () => {
    CaretakerApi.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send activation invite/i }));

    await waitFor(() => {
      expect(CaretakerApi.create).toHaveBeenCalledWith({
        firstName: 'Pedro',
        lastName: 'Reyes',
        email: 'pedro.reyes@gmail.com',
        phone: '09171234567',
        serviceBarangay: 'Bonuan Gueset',
      });
    });
    expect(await screen.findByText(/invitation sent to pedro.reyes@gmail.com/i)).toBeInTheDocument();
  });

  it('requires a service barangay and capitalizes names as they are typed (but not the email)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await user.type(screen.getByLabelText('First name'), "o'connor");
    expect(screen.getByLabelText('First name')).toHaveValue("O'connor");
    await user.type(screen.getByLabelText(/email/i), 'pedro@gmail.com');
    expect(screen.getByLabelText(/email/i)).toHaveValue('pedro@gmail.com');

    await user.click(screen.getByRole('button', { name: /send activation invite/i }));
    expect(CaretakerApi.create).not.toHaveBeenCalled();
    expect(screen.getByText('Select the barangay this caretaker works in')).toBeInTheDocument();
    // Submitting normalizes the name the same way the server does.
    expect(screen.getByLabelText('First name')).toHaveValue("O'Connor");
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

    expect(await screen.findByText('not set yet')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Service barangay for Carlo Cruz'), 'Lucao');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(CaretakerApi.update).toHaveBeenCalledWith('c1', { serviceBarangay: 'Lucao' }));
    expect(await screen.findByText('Lucao', { selector: 'span' })).toBeInTheDocument();
  });

  it('surfaces a server-side duplicate-email error', async () => {
    CaretakerApi.create.mockRejectedValue(
      new ApiClientError('Validation failed', 'VALIDATION_ERROR', 422, [{ field: 'email', message: 'Email already in use' }])
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByText(/no caretakers yet/i);

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /send activation invite/i }));

    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(await screen.findByText('Email already in use')).toBeInTheDocument();
  });
});
