import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScrollToTop from './ScrollToTop.jsx';
import { resetNavigationHistory } from './navigationHistory.js';

function BackLink() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>Browser back</button>;
}

describe('ScrollToTop', () => {
  let scrollY = 0;
  beforeEach(() => {
    resetNavigationHistory();
    scrollY = 0;
    vi.stubGlobal('scrollTo', vi.fn((x, y) => { scrollY = y; }));
    vi.spyOn(window, 'scrollY', 'get').mockImplementation(() => scrollY);
    vi.spyOn(document.documentElement, 'scrollHeight', 'get').mockReturnValue(5000);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts new pages at the top, and Back returns to where the user was', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/tenant/discover']}>
        <ScrollToTop />
        <Routes>
          <Route path="/tenant/discover" element={<Link to="/tenant/properties/p1">View details</Link>} />
          <Route path="/tenant/properties/:id" element={<BackLink />} />
        </Routes>
      </MemoryRouter>
    );

    // The tenant scrolls down the results list.
    scrollY = 1200;
    act(() => { window.dispatchEvent(new Event('scroll')); });
    await new Promise((resolve) => requestAnimationFrame(resolve));

    await user.click(screen.getByRole('link', { name: 'View details' }));
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 0);

    await user.click(screen.getByRole('button', { name: 'Browser back' }));
    await waitFor(() => expect(window.scrollTo).toHaveBeenLastCalledWith(0, 1200));
  });
});
