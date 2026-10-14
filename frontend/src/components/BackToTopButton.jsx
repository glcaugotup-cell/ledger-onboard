import { useEffect, useState } from 'react';
import { ChevronUpIcon } from '@heroicons/react/24/outline';
import { scrollBehavior } from '../utils/motion.js';

/**
 * Round "Back to top" button in the bottom-right corner. It only appears once the visitor has
 * scrolled more than about half a screen, so short pages never show it.
 */
export default function BackToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
      aria-label="Back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-brand-800 text-amber-400 shadow-xl transition-all duration-300 hover:bg-brand-900 hover:shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
      }`}
    >
      <ChevronUpIcon className="h-5 w-5 stroke-[2.5]" aria-hidden="true" />
    </button>
  );
}
