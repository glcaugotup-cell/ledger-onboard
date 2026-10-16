import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudentVerificationPage from './StudentVerificationPage.jsx';
import StudentVerificationApi from '../../services/StudentVerificationApi.js';
import { ApiClientError } from '../../services/apiClient.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/StudentVerificationApi.js', () => ({ default: { getMine: vi.fn(), submit: vi.fn(), replaceDocuments: vi.fn(), fetchDocument: vi.fn() } }));

const THIS_YEAR = new Date().getFullYear();
const FROM = String(THIS_YEAR - 1);
const UNTIL = String(THIS_YEAR + 2);
const photo = (name, type = 'image/jpeg') => new File(['photo-bytes'], name, { type });
const pending = { _id: 's1', status: 'PENDING', school: 'University of Luzon', validFromYear: THIS_YEAR - 1, validUntilYear: THIS_YEAR + 2 };

let refreshProfile;
function renderAs(userFields = {}, submission = null) {
  refreshProfile = vi.fn().mockResolvedValue(undefined);
  useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', fullName: 'Ana Student', role: 'tenant', ...userFields }, refreshProfile }));
  StudentVerificationApi.getMine.mockResolvedValue({ submission });
  return render(
    <MemoryRouter>
      <StudentVerificationPage />
    </MemoryRouter>
  );
}

async function fillForm(user, { school = 'PHINMA University of Pangasinan', from = FROM, until = UNTIL } = {}) {
  await user.upload(screen.getByLabelText('Front of your ID'), photo('front.jpg'));
  await user.upload(screen.getByLabelText('Back of your ID'), photo('back.png', 'image/png'));
  await user.selectOptions(screen.getByLabelText(/^school/i), school);
  if (from) await user.type(screen.getByLabelText(/^valid from/i), from);
  if (until) await user.type(screen.getByLabelText(/^valid until/i), until);
}

// User rule (2026-10-16): students verify their school ID (front, back, school, years) before reserving.
describe('StudentVerificationPage', () => {
  let open;
  let createUrl;
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    open = vi.spyOn(window, 'open').mockImplementation(() => null);
    createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:picked-photo');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks a new student to verify, and refreshes the profile in case an admin decided meanwhile', async () => {
    renderAs();
    expect(await screen.findByText('Verification required')).toBeInTheDocument();
    expect(screen.getByText(/Upload your school ID before you can reserve a room/)).toBeInTheDocument();
    expect(refreshProfile).toHaveBeenCalled();
    expect(screen.getByText(/landlords only see your school and until when your ID is valid/i)).toBeInTheDocument();
  });

  it('shows what is missing under each field and sends nothing', async () => {
    const user = userEvent.setup();
    renderAs();
    await user.click(await screen.findByRole('button', { name: 'Submit for review' }));

    expect(screen.getByText('Add a photo of the front of your ID.')).toBeInTheDocument();
    expect(screen.getByText('Add a photo of the back of your ID.')).toBeInTheDocument();
    expect(screen.getByText('Choose your school.')).toBeInTheDocument();
    expect(screen.getByText('Enter the first year printed on your ID, like 2024.')).toBeInTheDocument();
    expect(screen.getByText('Enter the last year printed on your ID, like 2028.')).toBeInTheDocument();
    expect(screen.getByText('Fix the 5 highlighted fields.')).toBeInTheDocument();
    expect(StudentVerificationApi.submit).not.toHaveBeenCalled();
  });

  it('refuses an ID whose last year has already ended, and years in the wrong order', async () => {
    const user = userEvent.setup();
    renderAs();
    await screen.findByText('Verification required');
    await fillForm(user, { from: String(THIS_YEAR - 5), until: String(THIS_YEAR - 1) });
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(screen.getAllByText(`This ID was only valid until May 31, ${THIS_YEAR - 1}. Upload your current school ID.`).length).toBeGreaterThan(0);

    await user.clear(screen.getByLabelText(/^valid from/i));
    await user.type(screen.getByLabelText(/^valid from/i), String(THIS_YEAR + 1));
    await user.clear(screen.getByLabelText(/^valid until/i));
    await user.type(screen.getByLabelText(/^valid until/i), String(THIS_YEAR));
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(screen.getAllByText("The last year can't be before the first year.").length).toBeGreaterThan(0);
    expect(StudentVerificationApi.submit).not.toHaveBeenCalled();
  });

  it('only accepts photos, and lets the student look at a photo before sending it, here or in a new tab', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderAs();
    await screen.findByText('Verification required');

    await user.upload(screen.getByLabelText('Front of your ID'), photo('scan.pdf', 'application/pdf'));
    expect(screen.getByRole('alert')).toHaveTextContent('Only JPG, PNG or WebP photos are accepted.');

    await user.upload(screen.getByLabelText('Front of your ID'), photo('front.jpg'));
    await user.click(screen.getByRole('button', { name: 'View Front of your ID' }));
    const dialog = screen.getByRole('dialog', { name: 'Front of your ID' });
    expect(within(dialog).getByRole('img', { name: 'Preview of Front of your ID' })).toHaveAttribute('src', 'blob:picked-photo');
    await user.click(within(dialog).getByRole('button', { name: 'Open in new tab' }));
    expect(open).toHaveBeenCalledWith('blob:picked-photo', '_blank', 'noopener,noreferrer');
    expect(createUrl).toHaveBeenCalled();
  });

  it('sends both photos, the school and the years, then shows that it is waiting for review', async () => {
    StudentVerificationApi.submit.mockResolvedValue({ submission: pending });
    const user = userEvent.setup();
    renderAs();
    await screen.findByText('Verification required');
    await fillForm(user, { school: 'Other' });
    await user.type(screen.getByLabelText(/^school name/i), 'Pangasinan State University');
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    await waitFor(() => expect(StudentVerificationApi.submit).toHaveBeenCalledTimes(1));
    const fd = StudentVerificationApi.submit.mock.calls[0][0];
    expect(fd.get('idFront').name).toBe('front.jpg');
    expect(fd.get('idBack').name).toBe('back.png');
    expect(fd.get('school')).toBe('Pangasinan State University');
    expect(fd.get('validFromYear')).toBe(FROM);
    expect(fd.get('validUntilYear')).toBe(UNTIL);
    expect(await screen.findByText(/sent for review/)).toBeInTheDocument();
    expect(screen.getByText('Waiting for review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit for review' })).not.toBeInTheDocument();
  });

  it("shows the server's message under the field it is about", async () => {
    StudentVerificationApi.submit.mockRejectedValue(new ApiClientError('Validation failed', 'VALIDATION_ERROR', 400, [{ field: 'validUntilYear', message: 'A school ID is valid for at most 10 years' }]));
    const user = userEvent.setup();
    renderAs();
    await screen.findByText('Verification required');
    await fillForm(user);
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));
    expect(await screen.findByText('A school ID is valid for at most 10 years')).toBeInTheDocument();
  });

  it('while waiting, the student can view a sent photo (here or in a new tab) and replace one', async () => {
    StudentVerificationApi.fetchDocument.mockResolvedValue({ url: 'blob:sent-front', type: 'image/jpeg' });
    StudentVerificationApi.replaceDocuments.mockResolvedValue({ submission: { ...pending, documentsUpdatedAt: '2026-10-16T03:00:00Z' } });
    const user = userEvent.setup();
    renderAs({ studentVerificationStatus: 'PENDING' }, pending);

    expect(await screen.findByText('Waiting for review')).toBeInTheDocument();
    expect(screen.getByText(`University of Luzon · valid ${FROM} – ${UNTIL}`)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View Front of your ID' }));
    expect(StudentVerificationApi.fetchDocument).toHaveBeenCalledWith('s1', 'front');
    const dialog = await screen.findByRole('dialog', { name: 'Front of your ID' });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'blob:sent-front');
    await user.click(within(dialog).getByRole('button', { name: 'Open in new tab' }));
    expect(open).toHaveBeenCalledWith('blob:sent-front', '_blank', 'noopener,noreferrer');
    await user.click(within(dialog).getByRole('button', { name: 'Close preview' }));

    await user.upload(screen.getByLabelText('New photo for Back of your ID'), photo('clearer.jpg'));
    await waitFor(() => expect(StudentVerificationApi.replaceDocuments).toHaveBeenCalledTimes(1));
    const [id, fd] = StudentVerificationApi.replaceDocuments.mock.calls[0];
    expect(id).toBe('s1');
    expect(fd.get('idBack').name).toBe('clearer.jpg');
    expect(fd.get('idFront')).toBeNull();
    expect(await screen.findByText('Back of your ID replaced. The admin will review the new photo.')).toBeInTheDocument();
  });

  it('a verified student sees their school and until when the ID counts, can view the photos, and has no form', async () => {
    renderAs({ studentVerificationStatus: 'VERIFIED', studentSchool: 'University of Luzon', studentIdValidUntilYear: THIS_YEAR + 2 }, { ...pending, status: 'VERIFIED' });
    expect(await screen.findByText('✓ Verified student')).toBeInTheDocument();
    expect(screen.getByText(`University of Luzon · your ID counts until May 31, ${UNTIL}. You can reserve rooms.`)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View Back of your ID' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Replace Back of your ID/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submit/ })).not.toBeInTheDocument();
  });

  it('a rejected student sees the reason and can submit again', async () => {
    renderAs({ studentVerificationStatus: 'REJECTED' }, { ...pending, status: 'REJECTED', rejectionReason: 'The photo is blurry or hard to read' });
    expect(await screen.findByText('Your school ID was not approved')).toBeInTheDocument();
    expect(screen.getByText('Reason: The photo is blurry or hard to read')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit again' })).toBeInTheDocument();
  });

  it('an expired ID asks for the current one and says the current stay is not affected', async () => {
    renderAs({ studentVerificationStatus: 'VERIFIED', studentSchool: 'University of Luzon', studentIdValidUntilYear: THIS_YEAR - 1 }, { ...pending, status: 'VERIFIED' });
    expect(await screen.findByText('Your student ID has expired')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`It was valid until May 31, ${THIS_YEAR - 1}\\. .*Your current stay is not affected\\.`))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit again' })).toBeInTheDocument();
  });
});
