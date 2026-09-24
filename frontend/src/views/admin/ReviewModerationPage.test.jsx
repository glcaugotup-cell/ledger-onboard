import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewModerationPage from './ReviewModerationPage.jsx';
import ReviewApi from '../../services/ReviewApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReviewApi.js', () => ({ default: { listPendingModeration: vi.fn(), moderate: vi.fn() } }));

const pending = {
  reviews: [
    {
      _id: 'rev1',
      rating: 4,
      comment: 'Great place, close to campus.',
      tenantId: { fullName: 'Juan Dela Cruz' },
      propertyId: { propertyName: 'Dagupan Demo Boarding House' },
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewModerationPage />
    </MemoryRouter>
  );
}

describe('ReviewModerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'a1', fullName: 'Admin Cruz', role: 'admin' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('shows an empty state when nothing is pending', async () => {
    ReviewApi.listPendingModeration.mockResolvedValue({ reviews: [] });
    renderPage();
    expect(await screen.findByText(/nothing pending review/i)).toBeInTheDocument();
  });

  it('renders the review author, property, star rating, and comment', async () => {
    ReviewApi.listPendingModeration.mockResolvedValue(pending);
    renderPage();
    expect(await screen.findByText('Juan Dela Cruz — Dagupan Demo Boarding House')).toBeInTheDocument();
    expect(screen.getByText('★★★★☆')).toBeInTheDocument();
    expect(screen.getByText('Great place, close to campus.')).toBeInTheDocument();
  });

  it('approves a review with no reason prompt', async () => {
    ReviewApi.listPendingModeration.mockResolvedValue(pending);
    ReviewApi.moderate.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /approve/i }));

    await waitFor(() => {
      expect(ReviewApi.moderate).toHaveBeenCalledWith('rev1', { status: 'APPROVED', reason: undefined });
    });
  });

  it('hides a review using the prompted reason', async () => {
    ReviewApi.listPendingModeration.mockResolvedValue(pending);
    ReviewApi.moderate.mockResolvedValue({});
    vi.spyOn(window, 'prompt').mockReturnValue('Contains personal contact info');
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^hide$/i }));

    await waitFor(() => {
      expect(ReviewApi.moderate).toHaveBeenCalledWith('rev1', { status: 'HIDDEN', reason: 'Contains personal contact info' });
    });
  });
});
