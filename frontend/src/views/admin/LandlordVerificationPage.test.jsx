import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LandlordVerificationPage from './LandlordVerificationPage.jsx';
import AdminApi from '../../services/AdminApi.js';
import LandlordVerificationApi from '../../services/LandlordVerificationApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/AdminApi.js', () => ({ default: { listPendingLandlordVerifications: vi.fn(), reviewLandlordVerification: vi.fn() } }));
vi.mock('../../services/LandlordVerificationApi.js', () => ({ default: { fetchDocument: vi.fn() } }));

const submission = {
  _id: 'v1',
  landlordId: { fullName: 'Gladdiel Ugot', email: 'gladdielugot@gmail.com' },
  submittedAt: '2026-10-14T02:59:00Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <LandlordVerificationPage />
    </MemoryRouter>
  );
}

describe('LandlordVerificationPage document preview', () => {
  let revoke;
  let open;
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'a1', fullName: 'Admin', role: 'admin' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    AdminApi.listPendingLandlordVerifications.mockResolvedValue({ submissions: [submission] });
    revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    open = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    revoke.mockRestore();
    open.mockRestore();
  });

  it('shows a photo inside the page instead of opening a new tab, with a button to open it in one', async () => {
    LandlordVerificationApi.fetchDocument.mockResolvedValue({ url: 'blob:permit', type: 'image/jpeg' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: "View Mayor's / Business Permit" }));
    expect(LandlordVerificationApi.fetchDocument).toHaveBeenCalledWith('v1', 'permit');
    const dialog = await screen.findByRole('dialog', { name: "Mayor's / Business Permit — Gladdiel Ugot" });
    expect(within(dialog).getByRole('img', { name: "Preview of Mayor's / Business Permit — Gladdiel Ugot" })).toHaveAttribute('src', 'blob:permit');
    expect(open).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Open in new tab' }));
    expect(open).toHaveBeenCalledWith('blob:permit', '_blank', 'noopener,noreferrer');

    await user.click(within(dialog).getByRole('button', { name: 'Close preview' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(revoke).toHaveBeenCalledWith('blob:permit');
  });

  it('shows a PDF inside the page too', async () => {
    LandlordVerificationApi.fetchDocument.mockResolvedValue({ url: 'blob:bir', type: 'application/pdf' });
    const user = userEvent.setup();
    const { container } = renderPage();

    await user.click(await screen.findByRole('button', { name: 'View BIR Form 2303' }));
    expect(LandlordVerificationApi.fetchDocument).toHaveBeenCalledWith('v1', 'bir');
    await screen.findByRole('dialog', { name: 'BIR Form 2303 — Gladdiel Ugot' });
    expect(container.ownerDocument.querySelector('iframe[title="Preview of BIR Form 2303 — Gladdiel Ugot"]')).toHaveAttribute('src', 'blob:bir');
  });

  it('shows an error and no preview when the document cannot be loaded', async () => {
    LandlordVerificationApi.fetchDocument.mockRejectedValue(new Error('Network Error'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'View BIR Form 2303' }));
    expect(await screen.findByText('Could not load that document.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tells the admin when the landlord replaced documents after submitting', async () => {
    AdminApi.listPendingLandlordVerifications.mockResolvedValue({ submissions: [{ ...submission, documentsUpdatedAt: '2026-10-14T03:20:00Z' }] });
    renderPage();
    expect(await screen.findByText(/^Documents updated /)).toBeInTheDocument();
  });
});
