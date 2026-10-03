/** Read the preference when scrolling so changes apply without a reload. */
export function scrollBehavior() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
