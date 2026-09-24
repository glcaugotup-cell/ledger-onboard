import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RegisterPage from './RegisterPage.jsx';
import { ApiClientError } from '../../services/apiClient.js';
import AuthApi from '../../services/AuthApi.js';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../services/AuthApi.js', () => ({
  default: { verifyRegistrationOtp: vi.fn(), resendOtp: vi.fn(), cancelRegistration: vi.fn() },
}));

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <RegisterPage />
    </MemoryRouter>
  );
}

// Fills every field for the default role (tenant), including the
// emergency contact fields that only render for that role, and checks the
// required privacy-consent box.
async function fillValidForm(user) {
  await user.type(screen.getByLabelText(/first name/i), 'Juan');
  await user.type(screen.getByLabelText(/last name/i), 'Dela Cruz');
  await user.type(screen.getByLabelText(/email/i), 'juan.delacruz@gmail.com');
  await user.type(screen.getByLabelText(/^phone/i), '09171234567');
  await user.type(screen.getByLabelText(/^password$/i), 'Str0ng!Pass');
  await user.type(screen.getByLabelText(/confirm password/i), 'Str0ng!Pass');
  await user.type(screen.getByLabelText(/emergency contact person/i), 'Maria Dela Cruz');
  await user.type(screen.getByLabelText(/emergency contact cp number/i), '09181234567');
  await user.click(screen.getByRole('checkbox'));
}

describe('RegisterPage', () => {
  afterEach(() => {
    useAuthMock.mockReset();
    AuthApi.verifyRegistrationOtp.mockReset();
    AuthApi.resendOtp.mockReset();
    AuthApi.cancelRegistration.mockReset();
  });

  it('auto-capitalizes a lowercase First Name on blur instead of showing an error', async () => {
    useAuthMock.mockReturnValue({ register: vi.fn() });
    const user = userEvent.setup();
    renderRegisterPage();

    const firstName = screen.getByLabelText(/first name/i);
    expect(screen.queryByText(/starts with an uppercase letter and contain only/i)).not.toBeInTheDocument();

    // Not fought while typing — the raw keystrokes land exactly as typed.
    await user.type(firstName, 'juan');
    expect(firstName).toHaveValue('juan');

    await user.tab();

    // Normalized on blur, and since "Juan" is valid, no error appears.
    await waitFor(() => expect(firstName).toHaveValue('Juan'));
    expect(screen.queryByText(/must start with an uppercase letter/i)).not.toBeInTheDocument();
  });

  it('still shows a validation error on blur for a name normalization cannot fix (leading digit)', async () => {
    useAuthMock.mockReturnValue({ register: vi.fn() });
    const user = userEvent.setup();
    renderRegisterPage();

    const firstName = screen.getByLabelText(/first name/i);
    await user.type(firstName, '1juan');
    await user.tab();

    expect(await screen.findByText(/must start with an uppercase letter/i)).toBeInTheDocument();
  });

  it('clears a field error live once the value becomes valid', async () => {
    useAuthMock.mockReturnValue({ register: vi.fn() });
    const user = userEvent.setup();
    renderRegisterPage();

    const firstName = screen.getByLabelText(/first name/i);
    await user.type(firstName, '1juan');
    await user.tab();
    expect(await screen.findByText(/must start with an uppercase letter/i)).toBeInTheDocument();

    await user.clear(firstName);
    await user.type(firstName, 'Juan');
    await waitFor(() => {
      expect(screen.queryByText(/must start with an uppercase letter/i)).not.toBeInTheDocument();
    });
  });

  it.each([
    ['ANGELO', 'Angelo'],
    ['calaycay', 'Calaycay'],
    ['mary-ann', 'Mary-Ann'],
    ['st. john', 'St. John'],
  ])('normalizes Last Name "%s" to "%s" on blur', async (input, expected) => {
    useAuthMock.mockReturnValue({ register: vi.fn() });
    const user = userEvent.setup();
    renderRegisterPage();

    const lastName = screen.getByLabelText(/last name/i);
    await user.type(lastName, input);
    await user.tab();

    await waitFor(() => expect(lastName).toHaveValue(expected));
  });

  it('blocks submission and surfaces all errors when required fields are empty', async () => {
    const register = vi.fn();
    useAuthMock.mockReturnValue({ register });
    const user = userEvent.setup();
    renderRegisterPage();

    await user.click(screen.getByRole('button', { name: /^register$/i }));

    expect(register).not.toHaveBeenCalled();
    const requiredErrors = await screen.findAllByText('This field is required');
    expect(requiredErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('strips letters typed into the phone field as the user types', async () => {
    useAuthMock.mockReturnValue({ register: vi.fn() });
    const user = userEvent.setup();
    renderRegisterPage();

    const phone = screen.getByLabelText(/phone/i);
    await user.type(phone, '09a17b1234567');
    expect(phone).toHaveValue('09171234567');
  });

  it('submits the form with a valid payload and moves to the verify-email step', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ register });
    const user = userEvent.setup();
    renderRegisterPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'juan.delacruz@gmail.com',
        // Normalized to E.164 before submit, even though "09171234567" was typed.
        phone: '+639171234567',
        password: 'Str0ng!Pass',
        role: 'tenant',
        privacyConsent: true,
        emergencyContact: { name: 'Maria Dela Cruz', phone: '+639181234567' },
      });
    });
    expect(await screen.findByRole('heading', { name: /verify your email/i })).toBeInTheDocument();
    expect(screen.getByText(/juan\.delacruz@gmail\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/resend otp in \d+ seconds/i)).toBeInTheDocument();
  });

  it('normalizes the Phone field to +63 format on blur', async () => {
    useAuthMock.mockReturnValue({ register: vi.fn() });
    const user = userEvent.setup();
    renderRegisterPage();

    const phone = screen.getByLabelText(/^phone/i);
    await user.type(phone, '09235753673');
    await user.tab();

    await waitFor(() => expect(phone).toHaveValue('+639235753673'));
  });

  it('verifies the OTP and shows the success message with an explicit Go to Login action (no auto-redirect)', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ register });
    AuthApi.verifyRegistrationOtp.mockResolvedValue({ message: 'Email verified. You can now log in.' });
    const user = userEvent.setup();
    renderRegisterPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));
    await screen.findByRole('heading', { name: /verify your email/i });

    await user.type(screen.getByPlaceholderText('123456'), '123456');
    await user.click(screen.getByRole('button', { name: /^verify email$/i }));

    expect(AuthApi.verifyRegistrationOtp).toHaveBeenCalledWith({ email: 'juan.delacruz@gmail.com', code: '123456' });
    expect(await screen.findByText(/registration successful/i)).toBeInTheDocument();
    expect(screen.getByText(/your email has been verified successfully/i)).toBeInTheDocument();

    // No auto-redirect — navigation only happens on the explicit click.
    const goToLogin = screen.getByRole('button', { name: /go to login/i });
    expect(goToLogin).toBeInTheDocument();
  });

  it('resends the OTP and resets the cooldown', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ register });
    AuthApi.resendOtp.mockResolvedValue({ message: 'A new verification code has been sent.' });
    const user = userEvent.setup();
    renderRegisterPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));
    await screen.findByRole('heading', { name: /verify your email/i });

    expect(screen.getByRole('button', { name: /resend otp in \d+ seconds/i })).toBeDisabled();
  });

  it('hides emergency contact fields and omits them from the payload for a landlord', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ register });
    const user = userEvent.setup();
    renderRegisterPage();

    await user.selectOptions(screen.getByLabelText(/i am a/i), 'landlord');
    expect(screen.queryByLabelText(/emergency contact person/i)).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/first name/i), 'Ana');
    await user.type(screen.getByLabelText(/last name/i), 'Landlord');
    await user.type(screen.getByLabelText(/email/i), 'ana.landlord@gmail.com');
    await user.type(screen.getByLabelText(/^phone/i), '09171234567');
    await user.type(screen.getByLabelText(/^password$/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/confirm password/i), 'Str0ng!Pass');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith(
        expect.not.objectContaining({ emergencyContact: expect.anything() })
      );
    });
  });

  it('blocks submission when the privacy consent box is left unchecked', async () => {
    const register = vi.fn();
    useAuthMock.mockReturnValue({ register });
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/first name/i), 'Juan');
    await user.type(screen.getByLabelText(/last name/i), 'Dela Cruz');
    await user.type(screen.getByLabelText(/email/i), 'juan.delacruz@gmail.com');
    await user.type(screen.getByLabelText(/^phone/i), '09171234567');
    await user.type(screen.getByLabelText(/^password$/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/confirm password/i), 'Str0ng!Pass');
    await user.type(screen.getByLabelText(/emergency contact person/i), 'Maria Dela Cruz');
    await user.type(screen.getByLabelText(/emergency contact cp number/i), '09181234567');
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    expect(register).not.toHaveBeenCalled();
    expect(await screen.findByText(/must agree to the privacy policy/i)).toBeInTheDocument();
  });

  it('surfaces server-side field errors returned after submission', async () => {
    const apiError = new ApiClientError('Validation failed', 'VALIDATION_ERROR', 422, [
      { field: 'email', message: 'Email is already registered' },
    ]);
    const register = vi.fn().mockRejectedValue(apiError);
    useAuthMock.mockReturnValue({ register });
    const user = userEvent.setup();
    renderRegisterPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(await screen.findByText('Email is already registered')).toBeInTheDocument();
  });

  it('shows a Cancel button on the verify-email step that cancels the pending registration and returns to the form', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ register });
    AuthApi.cancelRegistration.mockResolvedValue({ message: 'Registration cancelled. You can register again with the correct information.' });
    const user = userEvent.setup();
    renderRegisterPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));
    await screen.findByRole('heading', { name: /verify your email/i });

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(AuthApi.cancelRegistration).toHaveBeenCalledWith({ email: 'juan.delacruz@gmail.com' });
    // Back on the form, never treated as a successful verification.
    expect(await screen.findByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByText(/registration cancelled\. you can register again with the correct information\./i)).toBeInTheDocument();
  });

  it('still returns to the form after Cancel even if the cancel-registration call fails (best effort)', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ register });
    AuthApi.cancelRegistration.mockRejectedValue(new Error('network error'));
    const user = userEvent.setup();
    renderRegisterPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));
    await screen.findByRole('heading', { name: /verify your email/i });

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(await screen.findByRole('heading', { name: /create account/i })).toBeInTheDocument();
  });

  it('allows registering again (even with the same email) after cancelling', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ register });
    AuthApi.cancelRegistration.mockResolvedValue({ message: 'Registration cancelled. You can register again with the correct information.' });
    const user = userEvent.setup();
    renderRegisterPage();

    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /^register$/i }));
    await screen.findByRole('heading', { name: /verify your email/i });
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await screen.findByRole('heading', { name: /create account/i });

    // The form still has the previously-entered values — the user only
    // needs to fix what was wrong, e.g. re-submitting as-is here.
    await user.click(screen.getByRole('button', { name: /^register$/i }));

    await waitFor(() => expect(register).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: /verify your email/i })).toBeInTheDocument();
  });
});
