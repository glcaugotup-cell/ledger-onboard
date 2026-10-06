import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Remembers the in-app pages visited in this browser tab, so a Back button knows whether there is a
 * previous in-app page to return to (and which one) instead of guessing from window.history, which
 * can lead outside the app. Kept in sessionStorage so it survives a page refresh in the same tab.
 */
const STORAGE_KEY = 'ledgerOnboard.navHistory';
const MAX_ENTRIES = 50;

/** Auth screens are never a Back destination: going "back" to them would only redirect or sign out. */
const AUTH_PATHS = ['/login', '/register', '/forgot-password', '/reset-password', '/account-recovery', '/activate-caretaker'];

let state = { entries: [], index: -1 };

function load() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.entries) && Number.isInteger(saved.index)) state = saved;
  } catch {
    // Storage unavailable (private mode, tests): the in-memory copy is enough.
  }
}

function save() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore: Back then falls back to fixed parent pages after a refresh.
  }
}

load();

/** Records one location change. PUSH adds an entry, REPLACE swaps the current one, POP moves to the matching entry. */
export function recordNavigation({ key, pathname, search }, type) {
  const entry = { key, pathname, search, skip: false };
  if (type === 'POP') {
    const found = state.entries.findIndex((e) => e.key === key);
    if (found !== -1) {
      state.index = found;
    } else {
      // A refresh or a page we didn't see being created: start a fresh trail from here.
      state = { entries: [entry], index: 0 };
    }
  } else if (type === 'REPLACE' && state.index >= 0) {
    state.entries[state.index] = entry;
  } else {
    state.entries = [...state.entries.slice(0, state.index + 1), entry].slice(-MAX_ENTRIES);
    state.index = state.entries.length - 1;
  }
  save();
}

/** Marks the current page so Back from a later page skips over it (e.g. a form that was just submitted). */
export function skipCurrentEntry() {
  if (state.entries[state.index]) {
    state.entries[state.index].skip = true;
    save();
  }
}

/** The app area a path belongs to: 'tenant', 'landlord', 'caretaker', 'admin', or 'public' for "/" and "/properties/...". */
export function sectionOf(pathname) {
  const first = pathname.split('/')[1] || '';
  return first === '' || first === 'properties' ? 'public' : first;
}

export const isAuthPath = (pathname) => AUTH_PATHS.includes(pathname);

/**
 * How many history steps back the nearest usable in-app page is, or 0 when there is none.
 * Skips submitted forms and auth screens; with `sameSection`, only pages in the current area count.
 */
export function stepsToPreviousPage(currentPathname, { sameSection = true } = {}) {
  const section = sectionOf(currentPathname);
  for (let i = state.index - 1; i >= 0; i -= 1) {
    const entry = state.entries[i];
    if (entry.skip || isAuthPath(entry.pathname)) continue;
    if (sameSection && sectionOf(entry.pathname) !== section) return 0;
    if (entry.pathname === currentPathname) continue;
    return state.index - i;
  }
  return 0;
}

/** Test helper: forget everything. */
export function resetNavigationHistory() {
  state = { entries: [], index: -1 };
  save();
}

/** Mount once inside the router: keeps the trail in step with every location change. */
export function useTrackNavigation() {
  const location = useLocation();
  const type = useNavigationType();
  useEffect(() => {
    recordNavigation(location, type);
  }, [location, type]);
}
