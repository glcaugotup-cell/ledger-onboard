import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BackToTopButton from './BackToTopButton.jsx';

const scrollWindowTo = (y) => act(() => {
  window.scrollY = y;
  window.dispatchEvent(new Event('scroll'));
});

describe('BackToTopButton', () => {
  let scrollTo;
  beforeEach(() => {
    window.scrollY = 0;
    window.innerHeight = 800;
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });
  afterEach(() => {
    scrollTo.mockRestore();
    window.scrollY = 0;
  });

  it('stays hidden and out of the tab order near the top of the page', () => {
    render(<BackToTopButton />);
    const button = screen.getByLabelText('Back to top');
    expect(button).toHaveAttribute('aria-hidden', 'true');
    expect(button).toHaveAttribute('tabindex', '-1');
    scrollWindowTo(300); // less than ~half a screen
    expect(button).toHaveAttribute('aria-hidden', 'true');
  });

  it('appears after scrolling down a long page and takes the visitor back to the top', () => {
    render(<BackToTopButton />);
    scrollWindowTo(1500);
    const button = screen.getByRole('button', { name: 'Back to top' });
    expect(button).toHaveAttribute('tabindex', '0');
    fireEvent.click(button);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: expect.stringMatching(/^(smooth|auto)$/) });

    scrollWindowTo(0);
    expect(screen.queryByRole('button', { name: 'Back to top' })).not.toBeInTheDocument();
  });

  it('shows straight away when the page opens already scrolled down', () => {
    window.scrollY = 2000;
    render(<BackToTopButton />);
    expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument();
  });
});
