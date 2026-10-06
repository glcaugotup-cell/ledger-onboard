import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewModerationPage from './ReviewModerationPage.jsx';
import ReviewApi from '../../services/ReviewApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/ReviewApi.js', () => ({ default: { listAll: vi.fn(), moderate: vi.fn() } }));

const shown = {
  _id: 'rev1',
  rating: 4,
  comment: 'Great place, close to campus.',
  status: 'APPROVED',
  isVerifiedFormerTenant: true,
  tenantId: { fullName: 'Juan Dela Cruz' },
  propertyId: { propertyName: 'Dagupan Demo Boarding House' },
};
const hidden = { ...shown, _id: 'rev2', status: 'HIDDEN', moderationReason: 'Contains a phone number', tenantId: { fullName: 'Ana Reyes' } };
const waiting = { ...shown, _id: 'rev3', status: 'PENDING', tenantId: { fullName: 'Lito Santos' } };

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewModerationPage />
    </MemoryRouter>
  );
}

const cardOf = (name) => screen.getByText(new RegExp(`^${name} —`)).closest('div.rounded-xl');

describe('ReviewModerationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'a1', fullName: 'Admin Cruz', role: 'admin' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('shows an empty state when there are no reviews', async () => {
    ReviewApi.listAll.mockResolvedValue({ reviews: [] });
    renderPage();
    expect(await screen.findByText(/no reviews here/i)).toBeInTheDocument();
  });

  it('lists published reviews with author, property, stars, comment and status', async () => {
    ReviewApi.listAll.mockResolvedValue({ reviews: [shown] });
    renderPage();
    expect(await screen.findByText('Juan Dela Cruz — Dagupan Demo Boarding House')).toBeInTheDocument();
    expect(screen.getByText('★★★★☆')).toBeInTheDocument();
    expect(screen.getByText('Great place, close to campus.')).toBeInTheDocument();
    expect(within(cardOf('Juan Dela Cruz')).getByText('Shown')).toBeInTheDocument();
  });

  it('hides a published review with the reason typed in the dialog', async () => {
    ReviewApi.listAll.mockResolvedValue({ reviews: [shown] });
    ReviewApi.moderate.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /^hide$/i }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText('Reason'), 'Contains personal contact info');
    await user.click(within(dialog).getByRole('button', { name: 'Hide review' }));

    await waitFor(() => {
      expect(ReviewApi.moderate).toHaveBeenCalledWith('rev1', { status: 'HIDDEN', reason: 'Contains personal contact info' });
    });
  });

  it('restores a hidden review and publishes an older waiting one, with no reason prompt', async () => {
    ReviewApi.listAll.mockResolvedValue({ reviews: [hidden, waiting] });
    ReviewApi.moderate.mockResolvedValue({});
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/^Ana Reyes —/);
    expect(within(cardOf('Ana Reyes')).getByText('Hidden: Contains a phone number')).toBeInTheDocument();
    await user.click(within(cardOf('Ana Reyes')).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(ReviewApi.moderate).toHaveBeenCalledWith('rev2', { status: 'APPROVED', reason: undefined }));

    await user.click(within(cardOf('Lito Santos')).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(ReviewApi.moderate).toHaveBeenCalledWith('rev3', { status: 'APPROVED', reason: undefined }));
  });

  it('filters by status', async () => {
    ReviewApi.listAll.mockResolvedValue({ reviews: [shown, hidden, waiting] });
    const user = userEvent.setup();
    renderPage();

    await screen.findByText(/^Juan Dela Cruz —/);
    await user.click(screen.getByRole('tab', { name: 'Hidden' }));
    expect(screen.getByText(/^Ana Reyes —/)).toBeInTheDocument();
    expect(screen.queryByText(/^Juan Dela Cruz —/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Lito Santos —/)).not.toBeInTheDocument();
  });
});
