import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MaintenanceIssuesPage from './MaintenanceIssuesPage.jsx';
import MaintenanceIssueApi from '../../services/MaintenanceIssueApi.js';
import ReservationApi from '../../services/ReservationApi.js';
import CaretakerApi from '../../services/CaretakerApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';
import { todayInputValue } from '../../utils/validators.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/MaintenanceIssueApi.js', () => ({
  default: { list: vi.fn(), create: vi.fn(), assign: vi.fn(), complete: vi.fn(), resolve: vi.fn(), confirm: vi.fn(), remove: vi.fn(), archive: vi.fn(), restore: vi.fn(), getMedia: vi.fn() },
}));
vi.mock('../../services/ReservationApi.js', () => ({ default: { list: vi.fn() } }));
vi.mock('../../services/CaretakerApi.js', () => ({ default: { list: vi.fn() } }));

const stay = { _id: 'res1', status: 'active', propertyId: { propertyName: 'Sunshine' }, roomId: { roomNumber: '67' } };
const issue = (overrides = {}) => ({
  _id: 'i1', category: 'Plumbing', urgency: 'high', status: 'pending', description: 'Leaking sink', createdAt: '2026-10-01',
  roomId: { _id: 'r1', roomNumber: '67' }, propertyId: { propertyName: 'Sunshine' }, tenantId: { fullName: 'Tina Tenant' }, statusHistory: [], ...overrides,
});
const photo = (name) => new File(['img'], name, { type: 'image/png' });

function renderAs(role, entry = '/issues') {
  useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'u1', fullName: 'User', role } }));
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <MaintenanceIssuesPage />
    </MemoryRouter>
  );
}

describe('MaintenanceIssuesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    ReservationApi.list.mockResolvedValue({ reservations: [stay, { ...stay, _id: 'res2', status: 'approved' }] });
    CaretakerApi.list.mockResolvedValue({ caretakers: [{ _id: 'ct1', fullName: 'Carlo Caretaker', accountStatus: 'active' }] });
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [] });
    MaintenanceIssueApi.getMedia.mockResolvedValue('blob:photo');
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('M1: placeholders are not selectable rows, and the report is blocked until real choices are made', async () => {
    const user = userEvent.setup();
    renderAs('tenant');
    await user.click(await screen.findByRole('button', { name: 'Report an issue' }));
    const dialog = screen.getByRole('dialog', { name: 'Report maintenance issue' });

    const tenancyPlaceholder = within(dialog).getByLabelText('Apartment / room').querySelector('option[value=""]');
    const categoryPlaceholder = within(dialog).getByLabelText('Category').querySelector('option[value=""]');
    expect(tenancyPlaceholder).toHaveTextContent('Select a current tenancy');
    expect(categoryPlaceholder).toHaveTextContent('Choose category');
    for (const option of [tenancyPlaceholder, categoryPlaceholder]) {
      // Shown in the closed field only: disabled and hidden from the opened list.
      expect(option).toBeDisabled();
      expect(option).toHaveAttribute('hidden');
    }
    // Only the current stay is offered (not the reserved one).
    expect(within(dialog).getAllByRole('option', { name: /Sunshine · Room 67/ })).toHaveLength(1);

    await user.type(within(dialog).getByLabelText(/description/i), 'Water leaking under the sink');
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    expect(within(dialog).getByText('Choose a category.')).toBeInTheDocument();
    expect(MaintenanceIssueApi.create).not.toHaveBeenCalled();
  });

  it('M2: at most 5 photos, shown as a list with View and Remove and an "n / 5" counter', async () => {
    MaintenanceIssueApi.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderAs('tenant');
    await user.click(await screen.findByRole('button', { name: 'Report an issue' }));
    const dialog = screen.getByRole('dialog', { name: 'Report maintenance issue' });
    const input = within(dialog).getByLabelText('Photos');

    await user.upload(input, [1, 2, 3, 4, 5, 6, 7].map((n) => photo(`p${n}.png`)));
    expect(within(dialog).getByText('5 / 5')).toBeInTheDocument();
    expect(within(dialog).getByText(/You can attach up to 5 photos/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'View p1.png' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Remove p1.png' }));
    expect(within(dialog).getByText('4 / 5')).toBeInTheDocument();
    expect(within(dialog).queryByText('p1.png')).not.toBeInTheDocument();

    await user.selectOptions(within(dialog).getByLabelText(/category/i), 'Plumbing');
    await user.type(within(dialog).getByLabelText(/description/i), 'Water leaking under the sink');
    await user.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await waitFor(() => expect(MaintenanceIssueApi.create).toHaveBeenCalled());
    expect(MaintenanceIssueApi.create.mock.calls[0][0].getAll('photos')).toHaveLength(4);
  });

  it('M3: the landlord must choose a target date (today or later) when assigning', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [issue()] });
    MaintenanceIssueApi.assign.mockResolvedValue({});
    const user = userEvent.setup();
    renderAs('landlord');

    await user.click(await screen.findByRole('button', { name: 'Assign / update' }));
    const dialog = screen.getByRole('dialog', { name: 'Assign caretaker' });
    expect(within(dialog).getByText('Target resolution date').closest('label').textContent).not.toMatch(/optional/i);
    await user.selectOptions(within(dialog).getByLabelText(/caretaker/i), 'ct1');
    await user.click(within(dialog).getByRole('button', { name: 'Assign caretaker' }));
    expect(within(dialog).getByText('Choose a target resolution date.')).toBeInTheDocument();
    expect(MaintenanceIssueApi.assign).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/target resolution date/i), todayInputValue());
    await user.click(within(dialog).getByRole('button', { name: 'Assign caretaker' }));
    await waitFor(() => expect(MaintenanceIssueApi.assign).toHaveBeenCalledWith('i1', expect.objectContaining({ caretakerId: 'ct1', targetDate: todayInputValue() })));
  });

  it('M4: "Mark as done" needs a work summary', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [issue({ status: 'in_progress' })] });
    MaintenanceIssueApi.complete.mockResolvedValue({});
    const user = userEvent.setup();
    renderAs('landlord');

    await user.click(await screen.findByRole('button', { name: 'Mark as done' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as done' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/summary of the work/i);
    expect(MaintenanceIssueApi.complete).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText(/work summary/i), 'Replaced the trap');
    await user.click(within(dialog).getByRole('button', { name: 'Mark as done' }));
    await waitFor(() => expect(MaintenanceIssueApi.complete).toHaveBeenCalledWith('i1', 'Replaced the trap'));
  });

  it('M5: the tenant confirms the fix or says it is not solved yet', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [issue({ status: 'awaiting_confirmation', resolutionNotes: 'Replaced the trap' })] });
    MaintenanceIssueApi.confirm.mockResolvedValue({});
    const user = userEvent.setup();
    renderAs('tenant');

    expect(await screen.findByText('Awaiting tenant confirmation')).toBeInTheDocument();
    expect(screen.getByText(/Replaced the trap/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not solved yet' }));
    const dialog = screen.getByRole('dialog');
    await user.type(within(dialog).getByLabelText(/what is still wrong/i), 'Still dripping');
    await user.click(within(dialog).getByRole('button', { name: 'Reopen issue' }));
    await waitFor(() => expect(MaintenanceIssueApi.confirm).toHaveBeenCalledWith('i1', false, 'Still dripping'));

    await user.click(screen.getByRole('button', { name: 'Confirm solved' }));
    await waitFor(() => expect(MaintenanceIssueApi.confirm).toHaveBeenCalledWith('i1', true));
  });

  it('M6: only resolved issues can be deleted (archived) by the tenant, after confirmation', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [issue({ _id: 'open', status: 'in_progress' }), issue({ _id: 'done', status: 'resolved', category: 'Electrical' })] });
    MaintenanceIssueApi.archive.mockResolvedValue({});
    const user = userEvent.setup();
    renderAs('tenant');

    const deleteButtons = await screen.findAllByRole('button', { name: 'Delete' });
    expect(deleteButtons).toHaveLength(1);
    await user.click(deleteButtons[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Move to Archive' }));
    await waitFor(() => expect(MaintenanceIssueApi.archive).toHaveBeenCalledWith('done'));
  });

  it('M7: the landlord removes a report only with a reason; the tenant sees the reason', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [issue()] });
    MaintenanceIssueApi.remove.mockResolvedValue({});
    const user = userEvent.setup();
    const { unmount } = renderAs('landlord');

    await user.click(await screen.findByRole('button', { name: 'Remove report' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove report' }));
    expect(MaintenanceIssueApi.remove).not.toHaveBeenCalled();
    await user.click(within(dialog).getByLabelText('Duplicate report'));
    await user.click(within(dialog).getByRole('button', { name: 'Remove report' }));
    await waitFor(() => expect(MaintenanceIssueApi.remove).toHaveBeenCalledWith('i1', 'Duplicate report'));
    unmount();

    MaintenanceIssueApi.list.mockResolvedValue({ issues: [issue({ removedAt: '2026-10-02', removedReason: 'Duplicate report' })] });
    renderAs('tenant');
    expect(await screen.findByText(/Your landlord removed this report. Reason: Duplicate report/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('M8: caretakers can archive a task from their own list', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [issue({ status: 'in_progress', caretakerId: { _id: 'u1', fullName: 'User' } })] });
    MaintenanceIssueApi.archive.mockResolvedValue({});
    const user = userEvent.setup();
    renderAs('caretaker');

    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/only disappears from your list/i)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(MaintenanceIssueApi.archive).toHaveBeenCalledWith('i1'));
  });

  it('X1: a notification link (?issue=) opens that issue, with its status history', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [issue({ statusHistory: [{ event: 'reported', status: 'pending', at: '2026-10-01T02:00:00Z' }] })] });
    renderAs('landlord', '/landlord/issues?issue=i1');
    const dialog = await screen.findByRole('dialog', { name: 'Issue details' });
    expect(within(dialog).getByText('Status history')).toBeInTheDocument();
    expect(within(dialog).getByText('Reported')).toBeInTheDocument();
  });
});
