import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PasswordStrengthIndicator from './PasswordStrengthIndicator.jsx';

function filledSegments(container) {
  return container.querySelectorAll('[data-filled="true"]');
}

describe('PasswordStrengthIndicator', () => {
  it('is neutral with a dash (not "Weak") when the password is empty', () => {
    const { container } = render(<PasswordStrengthIndicator password="" />);
    expect(screen.getByText(/password strength:/i)).toHaveTextContent('Password strength: —');
    expect(screen.queryByText('Weak')).not.toBeInTheDocument();
    expect(filledSegments(container)).toHaveLength(0);
    expect(screen.getByRole('meter', { name: 'Password strength' })).toHaveAttribute('aria-valuenow', '0');
  });

  it.each([
    ['abc', 'Weak', 1, 'bg-red-500', 'text-red-600'],
    ['abcdefgh', 'Fair', 2, 'bg-orange-500', 'text-orange-600'],
    ['abcdefg1', 'Good', 3, 'bg-amber-400', 'text-amber-600'],
    ['Angelo@calaycay66', 'Strong', 4, 'bg-green-500', 'text-green-700'],
  ])('%s → %s, %i segment(s) filled in %s', (password, label, count, colorClass, textClass) => {
    const { container } = render(<PasswordStrengthIndicator password={password} />);
    expect(screen.getByText(/password strength:/i)).toHaveTextContent(`Password strength: ${label}`);
    expect(screen.getByText(/password strength:/i)).toHaveClass(textClass);
    const filled = filledSegments(container);
    expect(filled).toHaveLength(count);
    filled.forEach((seg) => expect(seg).toHaveClass(colorClass));
    const meter = screen.getByRole('meter', { name: 'Password strength' });
    expect(meter).toHaveAttribute('aria-valuenow', String(count));
    expect(meter).toHaveAttribute('aria-valuetext', label);
  });

  it('always renders exactly 4 segments', () => {
    const { container } = render(<PasswordStrengthIndicator password="abc" />);
    expect(container.querySelectorAll('[data-filled]')).toHaveLength(4);
  });
});
