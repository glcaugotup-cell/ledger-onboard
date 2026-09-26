/**
 * Calendar-day helpers in the app's timezone. The server runs in UTC, but "today"
 * for a Dagupan City user is the Philippine date, so date-only comparisons
 * (move-in dates, days until a bill is due) use Asia/Manila.
 */
const APP_TIME_ZONE = 'Asia/Manila';
const DAY_MS = 24 * 60 * 60 * 1000;

const keyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "YYYY-MM-DD" of the given instant in the app timezone. */
function appDateKey(date = new Date()) {
  return keyFormatter.format(new Date(date));
}

/**
 * "YYYY-MM-DD" for a value from a date picker. A bare "2026-09-30" is taken as
 * that calendar day as written; a full timestamp is converted to the app timezone.
 */
function inputDateKey(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return value.trim();
  if (value instanceof Date && value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0) {
    // express-validator's toDate() turns "2026-09-30" into 2026-09-30T00:00:00Z; keep that calendar day.
    return value.toISOString().slice(0, 10);
  }
  return appDateKey(value);
}

/** Whole calendar days from `from` to `to` in the app timezone (e.g. due Sep 30, today Sep 23 -> 7). */
function calendarDaysBetween(from, to) {
  const a = Date.parse(`${appDateKey(from)}T00:00:00Z`);
  const b = Date.parse(`${appDateKey(to)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

module.exports = { APP_TIME_ZONE, appDateKey, inputDateKey, calendarDaysBetween };
