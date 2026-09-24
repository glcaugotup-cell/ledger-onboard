import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationProvider, useNotifications } from './NotificationContext.jsx';
import NotificationApi from '../services/NotificationApi.js';
import { mockAuthValue } from '../test/mockContexts.js';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('./AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../services/NotificationApi.js', () => ({ default: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() } }));

function Harness() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  return (
    <div>
      <p data-testid="count">{unreadCount}</p>
      <ul>
        {notifications.map((n) => (
          <li key={n._id}>{n.title}</li>
        ))}
      </ul>
      <button onClick={() => markRead('n1')}>mark one</button>
      <button onClick={() => markAllRead()}>mark all</button>
    </div>
  );
}

function renderHarness() {
  return render(
    <NotificationProvider>
      <Harness />
    </NotificationProvider>
  );
}

describe('NotificationContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fetch notifications while unauthenticated', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ status: 'unauthenticated' }));
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
    expect(NotificationApi.list).not.toHaveBeenCalled();
  });

  it('fetches and derives the unread count once authenticated', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ status: 'authenticated' }));
    NotificationApi.list.mockResolvedValue({
      notifications: [
        { _id: 'n1', title: 'Reservation approved', read: false },
        { _id: 'n2', title: 'Payment verified', read: true },
      ],
    });
    renderHarness();

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    expect(NotificationApi.list).toHaveBeenCalledWith({ limit: 20 });
    expect(screen.getByText('Reservation approved')).toBeInTheDocument();
  });

  it('does not let a fetch failure crash the page', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ status: 'authenticated' }));
    NotificationApi.list.mockRejectedValue(new Error('boom'));
    renderHarness();
    await waitFor(() => expect(NotificationApi.list).toHaveBeenCalled());
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('marks one notification read and refreshes', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ status: 'authenticated' }));
    NotificationApi.list.mockResolvedValue({ notifications: [{ _id: 'n1', title: 'Reservation approved', read: false }] });
    NotificationApi.markRead.mockResolvedValue({});
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));

    await user.click(screen.getByRole('button', { name: 'mark one' }));

    await waitFor(() => expect(NotificationApi.markRead).toHaveBeenCalledWith('n1'));
    expect(NotificationApi.list).toHaveBeenCalledTimes(2);
  });

  it('marks all notifications read and refreshes', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ status: 'authenticated' }));
    NotificationApi.list.mockResolvedValue({ notifications: [] });
    NotificationApi.markAllRead.mockResolvedValue({});
    const user = userEvent.setup();
    renderHarness();
    await waitFor(() => expect(NotificationApi.list).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'mark all' }));

    await waitFor(() => expect(NotificationApi.markAllRead).toHaveBeenCalled());
    expect(NotificationApi.list).toHaveBeenCalledTimes(2);
  });
});
