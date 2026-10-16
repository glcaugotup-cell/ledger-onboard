import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LandlordVerificationPage from './LandlordVerificationPage.jsx';
import AdminApi from '../../services/AdminApi.js';
import StudentVerificationApi from '../../services/StudentVerificationApi.js';
import { ApiClientError } from '../../services/apiClient.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/AdminApi.js', () => ({
  default: { listPendingLandlordVerifications: vi.fn(), reviewLandlordVerification: vi.fn(), listPendingStudentVerifications: vi.fn(), reviewStudentVerification: vi.fn() },
}));
vi.mock('../../services/LandlordVerificationApi.js', () => ({ default: { fetchDocument: vi.fn() } }));
vi.mock('../../services/StudentVerificationApi.js', () => ({ default: { fetchDocument: vi.fn() } }));

const THIS_YEAR = new Date().getFullYear();
const student = {
  _id: 'sv1',
  tenantId: { fullName: 'Ana Student', email: 'ana.student@gmail.com' },
  school: 'University of Luzon',
  validFromYear: THIS_YEAR - 1,
  validUntilYear: THIS_YEAR + 2,
  submittedAt: '2026-10-16T02:00:00Z',
};
const landlord = { _id: 'v1', landlordId: { fullName: 'Gladdiel Ugot', email: 'gladdielugot@gmail.com' }, submittedAt: '2026-10-14T02:59:00Z' };

function Where() {
  const { search } = useLocation();
  return <p data-testid="search">{search}</p>;
}

function renderPage(path = '/admin/landlord-verifications') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/landlord-verifications" element={<><LandlordVerificationPage /><Where /></>} />
      </Routes>
    </MemoryRouter>
  );
}

// User rule (2026-10-16): the admin reviews student school IDs on the same Verifications page as
// landlord documents, on a Students tab; photos open inside the page and in a new tab.
describe('Verifications page, Students tab', () => {
  let open;
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'a1', fullName: 'Admin', role: 'admin' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    AdminApi.listPendingLandlordVerifications.mockResolvedValue({ submissions: [landlord] });
    AdminApi.listPendingStudentVerifications.mockResolvedValue({ submissions: [student] });
    open = vi.spyOn(window, 'open').mockImplementation(() => null);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows both tabs with how many are waiting; Landlords first, and switching keeps the address in step', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole('tab', { name: 'Landlords (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByRole('tab', { name: 'Students (1)' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByRole('heading', { name: 'Verifications' })).toBeInTheDocument();
    expect(screen.getByText('Gladdiel Ugot')).toBeInTheDocument();
    expect(screen.queryByText('Ana Student')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Students (1)' }));
    expect(screen.getByText('Ana Student')).toBeInTheDocument();
    expect(screen.queryByText('Gladdiel Ugot')).not.toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('?tab=students');
  });

  it('?tab=students (the notification link) opens the Students tab with the school, the years and both photos', async () => {
    renderPage('/admin/landlord-verifications?tab=students');
    expect(await screen.findByText('Ana Student')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Students (1)' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('University of Luzon')).toBeInTheDocument();
    expect(screen.getByText(`Valid ${THIS_YEAR - 1} – ${THIS_YEAR + 2}`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Front of ID of Ana Student' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Back of ID of Ana Student' })).toBeInTheDocument();
  });

  it('shows an ID photo inside the page, with a button to open it in a new tab', async () => {
    StudentVerificationApi.fetchDocument.mockResolvedValue({ url: 'blob:id-back', type: 'image/png' });
    const user = userEvent.setup();
    renderPage('/admin/landlord-verifications?tab=students');
    await user.click(await screen.findByRole('button', { name: 'View Back of ID of Ana Student' }));

    expect(StudentVerificationApi.fetchDocument).toHaveBeenCalledWith('sv1', 'back');
    const dialog = await screen.findByRole('dialog', { name: 'Back of ID — Ana Student' });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'blob:id-back');
    expect(open).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Open in new tab' }));
    expect(open).toHaveBeenCalledWith('blob:id-back', '_blank', 'noopener,noreferrer');
  });

  it('approves as typed, or with a corrected last year, and reloads the list', async () => {
    AdminApi.reviewStudentVerification.mockResolvedValue({ submission: { ...student, status: 'VERIFIED' } });
    const user = userEvent.setup();
    renderPage('/admin/landlord-verifications?tab=students');
    await user.click(await screen.findByRole('button', { name: 'Approve Ana Student' }));
    await waitFor(() => expect(AdminApi.reviewStudentVerification).toHaveBeenCalledWith('sv1', { approve: true }));
    await waitFor(() => expect(AdminApi.listPendingStudentVerifications).toHaveBeenCalledTimes(2));

    const year = screen.getByLabelText('Last valid year for Ana Student');
    await user.clear(year);
    await user.type(year, String(THIS_YEAR + 1));
    expect(screen.getByText(`Corrected from ${THIS_YEAR + 2}. The ID will count until May 31, ${THIS_YEAR + 1}.`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Approve Ana Student' }));
    await waitFor(() => expect(AdminApi.reviewStudentVerification).toHaveBeenLastCalledWith('sv1', { approve: true, validUntilYear: THIS_YEAR + 1 }));
  });

  it("shows the server's reason on the card when an approval is refused", async () => {
    AdminApi.reviewStudentVerification.mockRejectedValue(new ApiClientError(`This ID was only valid until May 31, ${THIS_YEAR - 1}. Reject it and ask for a current school ID.`, 'STUDENT_ID_EXPIRED', 400));
    const user = userEvent.setup();
    renderPage('/admin/landlord-verifications?tab=students');
    await user.click(await screen.findByRole('button', { name: 'Approve Ana Student' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(`This ID was only valid until May 31, ${THIS_YEAR - 1}.`);
  });

  it('rejecting needs a reason, which is sent to the student', async () => {
    AdminApi.reviewStudentVerification.mockResolvedValue({ submission: { ...student, status: 'REJECTED' } });
    const user = userEvent.setup();
    renderPage('/admin/landlord-verifications?tab=students');
    await user.click(await screen.findByRole('button', { name: 'Reject Ana Student' }));

    const dialog = screen.getByRole('dialog', { name: 'Reject this school ID?' });
    expect(dialog).toHaveTextContent('The student sees your reason in the app and can upload their ID again.');
    await user.click(within(dialog).getByRole('button', { name: 'Reject ID' }));
    expect(within(dialog).getByText('Select at least one reason.')).toBeInTheDocument();
    expect(AdminApi.reviewStudentVerification).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('checkbox', { name: 'The photo is blurry or hard to read' }));
    await user.click(within(dialog).getByRole('button', { name: 'Reject ID' }));
    await waitFor(() => expect(AdminApi.reviewStudentVerification).toHaveBeenCalledWith('sv1', { approve: false, rejectionReason: 'The photo is blurry or hard to read' }));
  });

  it('says so when no student IDs are waiting', async () => {
    AdminApi.listPendingStudentVerifications.mockResolvedValue({ submissions: [] });
    renderPage('/admin/landlord-verifications?tab=students');
    expect(await screen.findByText('No student IDs waiting for review')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Students (0)' })).toBeInTheDocument();
  });
});
