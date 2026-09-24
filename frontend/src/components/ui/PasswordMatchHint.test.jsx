import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PasswordMatchHint from './PasswordMatchHint.jsx';

describe('PasswordMatchHint', () => {
  it('shows nothing while confirm password is empty', () => {
    const { container } = render(<PasswordMatchHint password="Angelo@calaycay66" confirmPassword="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "✓ Passwords match" when the values are equal', () => {
    render(<PasswordMatchHint password="Angelo@calaycay66" confirmPassword="Angelo@calaycay66" />);
    expect(screen.getByText('Passwords match')).toBeInTheDocument();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('shows "Passwords do not match" when they differ', () => {
    render(<PasswordMatchHint password="Angelo@calaycay66" confirmPassword="Angelo@calaycay6" />);
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.queryByText('Passwords match')).not.toBeInTheDocument();
  });
});
