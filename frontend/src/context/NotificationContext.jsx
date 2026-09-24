import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import NotificationApi from '../services/NotificationApi.js';
import { useAuth } from './AuthContext.jsx';

const NotificationContext = createContext(null);
const POLL_INTERVAL_MS = 30000;

export function NotificationProvider({ children }) {
  const { status } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (status !== 'authenticated') return;
    try {
      const { notifications: list } = await NotificationApi.list({ limit: 20 });
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch {
      // Notifications are a convenience layer — a fetch failure shouldn't break the page.
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setNotifications([]);
      setUnreadCount(0);
      return undefined;
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, refresh]);

  const markRead = useCallback(
    async (id) => {
      await NotificationApi.markRead(id);
      await refresh();
    },
    [refresh]
  );

  const markAllRead = useCallback(async () => {
    await NotificationApi.markAllRead();
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ notifications, unreadCount, refresh, markRead, markAllRead }),
    [notifications, unreadCount, refresh, markRead, markAllRead]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within a NotificationProvider');
  return ctx;
}
