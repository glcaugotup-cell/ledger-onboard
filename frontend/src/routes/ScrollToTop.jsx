import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Scrolls to the top on route (pathname) changes. Plain <BrowserRouter> has no
 * built-in scroll restoration; same-page anchor scrolls are unaffected.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
