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
vi.mock('../../services/CaretakerApi.js', () => ({ default: { list: vi.fn(), create: vi.fn() } }));

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
    expect(screen.getByText('active')).toBeInTheDocument();
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
      });
    });
    expect(await screen.findByText(/invitation sent to pedro.reyes@gmail.com/i)).toBeInTheDocument();
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
