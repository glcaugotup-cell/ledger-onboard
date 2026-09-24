import '@testing-library/jest-dom/vitest';

// jsdom has no IntersectionObserver implementation. Components that use it
// for scroll-reveal / sticky-nav effects (e.g. LandingPage) only need the
// constructor to exist and observe()/disconnect() to be callable — tests
// don't rely on the callback actually firing.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no Blob-URL implementation either. Components that preview a
// selected File/video before upload (e.g. PropertyFormPage's photo/video
// previews) only need these to exist and not throw — tests don't rely on
// the returned URL actually resolving to anything.
if (typeof globalThis.URL.createObjectURL === 'undefined') {
  globalThis.URL.createObjectURL = () => 'blob:mock-url';
}
if (typeof globalThis.URL.revokeObjectURL === 'undefined') {
  globalThis.URL.revokeObjectURL = () => {};
}
