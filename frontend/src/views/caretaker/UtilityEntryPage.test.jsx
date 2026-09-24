import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UtilityEntryPage from './UtilityEntryPage.jsx';
import ReservationApi from '../../services/ReservationApi.js';
import UtilityApi from '../../services/UtilityApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn() } }));
vi.mock('../../services/UtilityApi.js', () => ({ default: { logReading: vi.fn() } }));

const reservations = {
  reservations: [
    {
      status: 'approved',
      roomId: { _id: 'r1', roomNumber: '101' },
      tenantId: { _id: 't1', fullName: 'Juan Dela Cruz' },
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <UtilityEntryPage />
    </MemoryRouter>
  );
}

describe('UtilityEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'c1', fullName: 'Caretaker Cruz', role: 'caretaker' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    ReservationApi.list.mockResolvedValue(reservations);
  });

  it('reveals the reading form only after a room is selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/select a room/i);
    expect(screen.queryByLabelText(/billing month/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/room/i), 'r1');
    expect(screen.getByLabelText(/billing month/i)).toBeInTheDocument();
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
  });

  it('submits the reading with per-tenant occupant readings', async () => {
    UtilityApi.logReading.mockResolvedValue({ soas: [{ totalAmountDue: 850 }] });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText(/room/i), 'r1');
    await user.type(screen.getByLabelText(/total electric bill/i), '500');
    await user.type(screen.getByLabelText(/total water bill/i), '200');
    await user.type(screen.getByPlaceholderText('Previous reading'), '100');
    await user.type(screen.getByPlaceholderText('Current reading'), '150');
    await user.click(screen.getByRole('button', { name: /submit reading/i }));

    await waitFor(() => {
      expect(UtilityApi.logReading).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 'r1',
          totalElectricBill: 500,
          totalWaterBill: 200,
          occupantReadings: [{ tenantId: 't1', previousReading: 100, currentReading: 150 }],
        })
      );
    });
    expect(await screen.findByText(/reading logged/i)).toBeInTheDocument();
  });

  it('shows an error message when submission fails', async () => {
    UtilityApi.logReading.mockRejectedValue({ message: 'Reading already logged for this month' });
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText(/room/i), 'r1');
    await user.type(screen.getByLabelText(/total electric bill/i), '500');
    await user.type(screen.getByLabelText(/total water bill/i), '200');
    await user.type(screen.getByPlaceholderText('Previous reading'), '100');
    await user.type(screen.getByPlaceholderText('Current reading'), '150');
    await user.click(screen.getByRole('button', { name: /submit reading/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Reading already logged for this month');
  });
});
