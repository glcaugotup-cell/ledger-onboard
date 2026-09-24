import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import PasswordInput from './PasswordInput.jsx';
import { Field } from './Field.jsx';

describe('PasswordInput', () => {
  it('is masked by default and toggles show/hide from a keyboard-accessible button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Field label="New password">
        <PasswordInput value="Angelo@calaycay66" onChange={onChange} />
      </Field>
    );
    const input = screen.getByLabelText('New password');
    expect(input).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('type', 'button'); // never submits the form
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('Angelo@calaycay66');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });
});
