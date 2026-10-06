import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useTrackNavigation } from './navigationHistory.js';

/**
 * Plain <BrowserRouter> has no built-in scroll restoration, so this handles it:
 * - a new page (link, redirect) starts at the top; changes to only the query string (filters) don't scroll;
 * - Back/Forward return to where the user was on that page, waiting briefly for its content to load.
 * It also keeps the in-app navigation trail that the Back button uses.
 */
const STORAGE_KEY = 'ledgerOnboard.scrollPositions';
const RESTORE_TIMEOUT_MS = 3000;

let positions = {};
try {
  positions = JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {};
} catch {
  positions = {};
}
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // Ignore: restoring is a convenience.
  }
}

/** Scrolls to `y` as soon as the page is tall enough (results often load after the page appears). Returns a cancel function. */
function restoreScroll(y) {
  let frame = null;
  const start = Date.now();
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
  };
  const step = () => {
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.min(y, maxY));
    if (maxY >= y || Date.now() - start > RESTORE_TIMEOUT_MS) {
      stop();
      return;
    }
    frame = requestAnimationFrame(step);
  };
  // The user scrolling or typing takes over.
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('keydown', stop);
  step();
  return stop;
}

export default function ScrollToTop() {
  const location = useLocation();
  const type = useNavigationType();
  const previousPathname = useRef(null);
  // Set during render, so a scroll event caused by the next page's layout is never saved under the old page.
  const currentKey = useRef(location.key);
  currentKey.current = location.key;

  useTrackNavigation();

  useEffect(() => {
    const key = location.key;
    let frame = null;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (currentKey.current !== key) return;
        positions[key] = window.scrollY;
        persist();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [location.key]);

  useEffect(() => {
    const pathnameChanged = previousPathname.current !== location.pathname;
    previousPathname.current = location.pathname;
    if (type === 'POP') return restoreScroll(positions[location.key] ?? 0);
    if (pathnameChanged) window.scrollTo(0, 0);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  return null;
}
