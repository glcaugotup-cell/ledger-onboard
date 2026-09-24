import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PaymentsPage from './PaymentsPage.jsx';
import PaymentApi from '../../services/PaymentApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/PaymentApi.js', () => ({ default: { list: vi.fn(), verify: vi.fn(), fetchProofImageObjectUrl: vi.fn() } }));

describe('PaymentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('renders the heading and delegates verification listing to PaymentVerificationList', async () => {
    PaymentApi.list.mockResolvedValue({ payments: [] });
    render(
      <MemoryRouter>
        <PaymentsPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument();
    expect(await screen.findByText(/nothing to verify/i)).toBeInTheDocument();
  });
});
