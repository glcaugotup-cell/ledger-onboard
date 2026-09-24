import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ActivateCaretakerPage from './ActivateCaretakerPage.jsx';
import AuthApi from '../../services/AuthApi.js';
import { ApiClientError } from '../../services/apiClient.js';

vi.mock('../../services/AuthApi.js', () => ({ default: { activateCaretaker: vi.fn() } }));

const VALID_PASSWORD = 'Str0ng!Pass1';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/activate-caretaker?token=abc123']}>
      <Routes>
        <Route path="/activate-caretaker" element={<ActivateCaretakerPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ActivateCaretakerPage — password visibility toggle', () => {
  it('starts with the password field masked and a "Show password" toggle', () => {
    renderPage();
    const input = screen.getByLabelText(/^new password/i);
    expect(input).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(2); // New password + Confirm password
  });

  it('reveals the password as plain text on click, without changing its value, then re-hides it', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/^new password/i);

    await user.type(input, VALID_PASSWORD);
    expect(input).toHaveValue(VALID_PASSWORD);
    expect(input).toHaveAttribute('type', 'password');

    const [newPasswordToggle] = screen.getAllByRole('button', { name: 'Show password' });
    await user.click(newPasswordToggle);
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue(VALID_PASSWORD);

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveValue(VALID_PASSWORD);
  });

  it('keeps the strength indicator updating regardless of visibility, with no requirement checklist shown', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/^new password/i);

    await user.click(screen.getAllByRole('button', { name: 'Show password' })[0]);
    await user.type(input, VALID_PASSWORD);
    expect(screen.getByRole('meter', { name: 'Password strength' })).toHaveAttribute('aria-valuetext', 'Strong');
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument();
  });

  it('blocks an invalid password and names what is missing', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password/i), 'weakpass');
    await user.type(screen.getByLabelText(/^confirm password/i), 'weakpass');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Password needs an uppercase letter, a number and a special character.');
    expect(AuthApi.activateCaretaker).not.toHaveBeenCalled();
  });
});

describe('ActivateCaretakerPage — confirm password', () => {
  it('renders a Confirm password field with its own show/hide toggle', () => {
    renderPage();
    expect(screen.getByLabelText(/^confirm password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^confirm password/i)).toHaveAttribute('type', 'password');
    expect(screen.getAllByRole('button', { name: 'Show password' })).toHaveLength(2);
  });

  it('shows nothing until both fields have a value', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password/i), VALID_PASSWORD);
    expect(screen.queryByText('Passwords match')).not.toBeInTheDocument();
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
  });

  it('shows "Passwords do not match" live while the values differ', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password/i), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/^confirm password/i), 'Different1!');
    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(screen.queryByText('Passwords match')).not.toBeInTheDocument();
  });

  it('shows "✓ Passwords match" once the confirm value exactly equals the password', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password/i), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/^confirm password/i), VALID_PASSWORD);
    expect(screen.getByText('Passwords match')).toBeInTheDocument();
    expect(screen.queryByText('Passwords do not match')).not.toBeInTheDocument();
  });

  it('toggling visibility on the confirm field never changes its value', async () => {
    const user = userEvent.setup();
    renderPage();
    const confirmInput = screen.getByLabelText(/^confirm password/i);
    await user.type(confirmInput, VALID_PASSWORD);

    const toggles = screen.getAllByRole('button', { name: 'Show password' });
    await user.click(toggles[1]); // the confirm-password toggle
    expect(confirmInput).toHaveAttribute('type', 'text');
    expect(confirmInput).toHaveValue(VALID_PASSWORD);

    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(confirmInput).toHaveAttribute('type', 'password');
    expect(confirmInput).toHaveValue(VALID_PASSWORD);
  });

  it('blocks submission and never calls the API when the passwords do not match', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password/i), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/^confirm password/i), 'Different1!');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    expect(AuthApi.activateCaretaker).not.toHaveBeenCalled();
  });

  it('blocks submission when confirm password is left empty', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByLabelText(/^new password/i), VALID_PASSWORD);
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    expect(screen.getByText('Please confirm your password.')).toBeInTheDocument();
    expect(AuthApi.activateCaretaker).not.toHaveBeenCalled();
  });

  it('submits only { token, password } — never the confirm-password value — once everything is valid', async () => {
    AuthApi.activateCaretaker.mockResolvedValue({ message: 'Account activated.' });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText(/^new password/i), VALID_PASSWORD);
    await user.type(screen.getByLabelText(/^confirm password/i), VALID_PASSWORD);
    await user.click(screen.getAllByRole('button', { name: 'Show password' })[0]);
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    expect(AuthApi.activateCaretaker).toHaveBeenCalledWith({ token: 'abc123', password: VALID_PASSWORD });
    expect(AuthApi.activateCaretaker).toHaveBeenCalledWith(expect.not.objectContaining({ confirmPassword: expect.anything() }));
  });
});

describe('ActivateCaretakerPage — password strength indicator', () => {
  it('shows one strength meter under New password only, updating as the password gets stronger', async () => {
    const user = userEvent.setup();
    renderPage();
    const meters = screen.getAllByRole('meter', { name: 'Password strength' });
    expect(meters).toHaveLength(1);
    expect(screen.getByText('Password strength: —')).toBeInTheDocument();

    const input = screen.getByLabelText(/^new password/i);
    // The meter follows New password and precedes Confirm password in document order.
    expect(input.compareDocumentPosition(meters[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(meters[0].compareDocumentPosition(screen.getByLabelText(/^confirm password/i)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.type(input, 'Angelo@calaycay66');
    expect(meters[0]).toHaveAttribute('aria-valuetext', 'Strong');
    expect(screen.getByText('Password strength: Strong')).toBeInTheDocument();
  });
});

describe('ActivateCaretakerPage — redirect after activation', () => {
  function renderWithDestinations() {
    return render(
      <MemoryRouter initialEntries={['/activate-caretaker?token=abc123']}>
        <Routes>
          <Route path="/activate-caretaker" element={<ActivateCaretakerPage />} />
          <Route path="/" element={<p>Landing page</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('goes to the landing page (/) — not /login — after a successful activation', async () => {
    AuthApi.activateCaretaker.mockResolvedValue({ message: 'Account activated.' });
    const user = userEvent.setup();
    renderWithDestinations();

    await user.type(screen.getByLabelText(/^new password/i), 'Angelo@calaycay66');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Angelo@calaycay66');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    expect(await screen.findByText('Account activated.')).toBeInTheDocument();
    expect(await screen.findByText('Landing page', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('stays on the activation page with the error when activation fails (e.g. expired link)', async () => {
    AuthApi.activateCaretaker.mockRejectedValue(new ApiClientError('Invalid or expired activation link', 'INVALID_ACTIVATION_TOKEN', 400));
    const user = userEvent.setup();
    renderWithDestinations();

    await user.type(screen.getByLabelText(/^new password/i), 'Angelo@calaycay66');
    await user.type(screen.getByLabelText(/^confirm password/i), 'Angelo@calaycay66');
    await user.click(screen.getByRole('button', { name: 'Activate account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired activation link');
    await new Promise((r) => setTimeout(r, 1500)); // longer than the success redirect delay
    expect(screen.getByRole('button', { name: 'Activate account' })).toBeInTheDocument();
    expect(screen.queryByText('Landing page')).not.toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });
});
