import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PrivacyPolicyModal from './PrivacyPolicyModal.jsx';

describe('PrivacyPolicyModal', () => {
  it('renders nothing when closed', () => {
    render(<PrivacyPolicyModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the dialog with an accessible label and the policy content when open', () => {
    render(<PrivacyPolicyModal open onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Privacy Policy' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/respects your privacy/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Information We Collect' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contact Us' })).toBeInTheDocument();
    // Location use is explained, without claiming device tracking.
    expect(screen.getByRole('heading', { name: 'Location (GPS) Information' })).toBeInTheDocument();
    expect(screen.getByText(/does not read your device's GPS and does not track where you are/i)).toBeInTheDocument();
  });

  it('calls onClose when the X button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PrivacyPolicyModal open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /close privacy policy/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the footer Close button is clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PrivacyPolicyModal open onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking the overlay outside the dialog', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PrivacyPolicyModal open onClose={onClose} />);
    // The dialog itself stops propagation, so clicking the dialog must NOT close it.
    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    // Clicking the overlay (outside the dialog) must close it.
    await user.click(screen.getByRole('dialog').parentElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PrivacyPolicyModal open onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll while open, and restores it once the exit transition finishes', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(<PrivacyPolicyModal open={false} onClose={vi.fn()} />);
      expect(document.body.style.overflow).not.toBe('hidden');

      rerender(<PrivacyPolicyModal open onClose={vi.fn()} />);
      expect(document.body.style.overflow).toBe('hidden');

      rerender(<PrivacyPolicyModal open={false} onClose={vi.fn()} />);
      // Still locked immediately after closing — the panel is mid exit-animation.
      expect(document.body.style.overflow).toBe('hidden');

      act(() => {
        vi.advanceTimersByTime(250);
      });
      expect(document.body.style.overflow).not.toBe('hidden');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns focus to the previously focused element once fully closed', () => {
    vi.useFakeTimers();
    try {
      const trigger = document.createElement('button');
      document.body.appendChild(trigger);
      trigger.focus();
      expect(document.activeElement).toBe(trigger);

      const { rerender } = render(<PrivacyPolicyModal open onClose={vi.fn()} />);
      rerender(<PrivacyPolicyModal open={false} onClose={vi.fn()} />);
      act(() => {
        vi.advanceTimersByTime(250);
      });

      expect(document.activeElement).toBe(trigger);
      trigger.remove();
    } finally {
      vi.useRealTimers();
    }
  });
});
