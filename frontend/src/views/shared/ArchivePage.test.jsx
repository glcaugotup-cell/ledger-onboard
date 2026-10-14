import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ArchivePage from './ArchivePage.jsx';
import MaintenanceIssueApi from '../../services/MaintenanceIssueApi.js';
import PropertyApi from '../../services/PropertyApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/MaintenanceIssueApi.js', () => ({ default: { list: vi.fn(), restore: vi.fn(), deleteFromArchive: vi.fn() } }));
vi.mock('../../services/PropertyApi.js', () => ({ default: { listArchived: vi.fn(), restore: vi.fn(), deleteFromArchive: vi.fn() } }));

const removedIssue = { _id: 'i1', category: 'Plumbing', description: 'Leak', createdAt: '2026-10-01', roomId: { roomNumber: '67' }, propertyId: { propertyName: 'Sunshine' }, removedAt: '2026-10-02', removedReason: 'Duplicate report', tenantId: { fullName: 'Tina Tenant' } };

function renderAs(role) {
  useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'u1', fullName: 'User', role, hasPaymentQr: true } }));
  return render(<MemoryRouter><ArchivePage /></MemoryRouter>);
}

describe('ArchivePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    MaintenanceIssueApi.restore.mockResolvedValue({});
    PropertyApi.restore.mockResolvedValue({});
  });

  it('landlord: lists hidden properties and removed reports with reasons, and restores them', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [removedIssue] });
    PropertyApi.listArchived.mockResolvedValue({ properties: [{ _id: 'p9', propertyName: 'Old House', address: { barangay: 'Lucao' }, deletedAt: '2026-09-20' }] });
    const user = userEvent.setup();
    renderAs('landlord');

    expect(await screen.findByText('Old House')).toBeInTheDocument();
    expect(MaintenanceIssueApi.list).toHaveBeenCalledWith({ archived: 'true' });
    expect(screen.getByText(/Duplicate report/)).toBeInTheDocument();

    const restoreButtons = screen.getAllByRole('button', { name: 'Restore' });
    await user.click(restoreButtons[0]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(PropertyApi.restore).toHaveBeenCalledWith('p9'));

    await user.click(screen.getAllByRole('button', { name: 'Restore' })[1]);
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Restore' }));
    await waitFor(() => expect(MaintenanceIssueApi.restore).toHaveBeenCalledWith('i1'));
  });

  it('tenant: shows archived issues only (no properties) and an empty state when there are none', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [] });
    renderAs('tenant');
    expect(await screen.findByText('Your archive is empty')).toBeInTheDocument();
    expect(PropertyApi.listArchived).not.toHaveBeenCalled();
  });

  it('deletes an item from the Archive after confirming; Keep it changes nothing', async () => {
    const resolved = { _id: 'i2', category: 'Electrical', description: 'not working', createdAt: '2026-10-04', roomId: { roomNumber: '101' }, propertyId: { propertyName: 'Dagupan Demo Boarding House' } };
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [resolved] });
    MaintenanceIssueApi.deleteFromArchive.mockResolvedValue({});
    const user = userEvent.setup();
    renderAs('tenant');

    await user.click(await screen.findByRole('button', { name: 'Delete Electrical · Room 101' }));
    let dialog = screen.getByRole('dialog', { name: 'Delete from your Archive?' });
    expect(within(dialog).getByText(/can't be restored. Your landlord keeps the record./)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(MaintenanceIssueApi.deleteFromArchive).not.toHaveBeenCalled();

    MaintenanceIssueApi.list.mockResolvedValue({ issues: [] });
    await user.click(screen.getByRole('button', { name: 'Delete Electrical · Room 101' }));
    dialog = screen.getByRole('dialog', { name: 'Delete from your Archive?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(MaintenanceIssueApi.deleteFromArchive).toHaveBeenCalledWith('i2'));
    expect(await screen.findByText('Deleted from your Archive.')).toBeInTheDocument();
    expect(screen.getByText('Your archive is empty')).toBeInTheDocument();
  });

  it('landlord: deletes a hidden property from the Archive (records stay)', async () => {
    MaintenanceIssueApi.list.mockResolvedValue({ issues: [] });
    PropertyApi.listArchived.mockResolvedValue({ properties: [{ _id: 'p9', propertyName: 'Old House', address: { barangay: 'Lucao' }, deletedAt: '2026-09-20' }] });
    PropertyApi.deleteFromArchive.mockResolvedValue({});
    const user = userEvent.setup();
    renderAs('landlord');

    await user.click(await screen.findByRole('button', { name: 'Delete Old House' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete from your Archive?' });
    expect(within(dialog).getByText(/rooms, reservations, bills and reviews stay on record/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(PropertyApi.deleteFromArchive).toHaveBeenCalledWith('p9'));
  });
});
