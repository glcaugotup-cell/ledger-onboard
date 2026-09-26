/** Display formatting shared by every page, so dates, money and statuses look the same everywhere. */

/** "Sep 11, 2026" */
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Sep 11, 2026, 3:04 PM" */
export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * "September 2026" for a billing period. Periods are stored as the 1st of the
 * month in UTC, so read them in UTC to avoid showing the previous month.
 */
export function formatPeriod(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** "₱3,180" / "₱3,180.50" */
export function formatPeso(value) {
  const n = Number(value) || 0;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** "OVERDUE" -> "Overdue", "pending_activation" -> "Pending activation", "pending_moderation" -> "Pending moderation". */
export function formatStatus(value) {
  if (!value) return '';
  const text = String(value).replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Juan Dela Cruz" -> "JD" */
export function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
export function formatRelative(value, now = new Date()) {
  if (!value) return '';
  const diff = Math.max(0, now.getTime() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(value);
}
