import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ActivationCodeDialog from './ActivationCodeDialog.jsx';

const caretaker = { _id: 'c1', fullName: 'Pedro Reyes', email: 'pedro.reyes@gmail.com' };

describe('ActivationCodeDialog', () => {
  it('shows the code once with its expiry and how the caretaker uses it', () => {
    render(<ActivationCodeDialog caretaker={caretaker} code="ABCDE-FGHJK" expiresAt="2026-10-15T04:30:00Z" onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Activation code for Pedro Reyes' })).toBeInTheDocument();
    expect(screen.getByTestId('activation-code')).toHaveTextContent('ABCDE-FGHJK');
    expect(screen.getByText(/Expires Oct 15, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/shown only once/i)).toBeInTheDocument();
    expect(screen.getByText(/pedro\.reyes@gmail\.com, this code and a new password/)).toBeInTheDocument();
  });

  it('copies the code and closes', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const onClose = vi.fn();
    render(<ActivationCodeDialog caretaker={caretaker} code="ABCDE-FGHJK" expiresAt="2026-10-15T04:30:00Z" onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(writeText).toHaveBeenCalledWith('ABCDE-FGHJK');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});
