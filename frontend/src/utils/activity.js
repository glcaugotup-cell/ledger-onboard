const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Anyone whose last authenticated request was this recent counts as "Active now". */
export const ACTIVE_NOW_MINUTES = 5;
/** Admins may deactivate an account after this many days without activity (never automatic). */
export const INACTIVITY_DEACTIVATION_DAYS = 60;

/** Whole days since the user's last activity, or null if they have never signed in. */
export function daysSinceActive(user, now = new Date()) {
  if (!user?.lastLoginAt || !user?.lastActivityAt) return null;
  return Math.floor((now.getTime() - new Date(user.lastActivityAt).getTime()) / DAY_MS);
}

/**
 * "Active now", "Active 5 minutes ago", "Active 1 day ago", "Active 2 months ago",
 * or "Never active" for accounts that have never signed in. This is activity only;
 * the account status (active/suspended/...) is shown separately.
 */
export function formatLastActive(user, now = new Date()) {
  if (!user?.lastLoginAt || !user?.lastActivityAt) return 'Never active';
  const elapsed = Math.max(0, now.getTime() - new Date(user.lastActivityAt).getTime());
  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < ACTIVE_NOW_MINUTES) return 'Active now';
  const plural = (n, unit) => `Active ${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (minutes < 60) return plural(minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return plural(hours, 'hour');
  const days = Math.floor(elapsed / DAY_MS);
  if (days < 30) return plural(days, 'day');
  const months = Math.floor(days / 30);
  if (months < 12) return plural(months, 'month');
  return plural(Math.floor(days / 365), 'year');
}

/** True when an admin may use "Deactivate for inactivity" on this account. */
export function isEligibleForInactivityDeactivation(user, now = new Date()) {
  if (!user || user.role === 'admin') return false;
  if (!['active', 'archived'].includes(user.accountStatus)) return false;
  const last = user.lastActivityAt || user.createdAt;
  if (!last) return false;
  return (now.getTime() - new Date(last).getTime()) / DAY_MS >= INACTIVITY_DEACTIVATION_DAYS;
}
