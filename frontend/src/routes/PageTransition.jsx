import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** Fade route changes without remounting layouts or delaying navigation. */
export default function PageTransition({ children }) {
  const { pathname } = useLocation();
  const contentRef = useRef(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    // Opacity only: transforms would change how fixed menus and dialogs behave.
    const animation = content.animate([{ opacity: 0.8 }, { opacity: 1 }], {
      duration: 180,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    });
    return () => animation.cancel();
  }, [pathname]);

  return <div ref={contentRef} data-page-transition>{children}</div>;
}
