import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LandingPage from './LandingPage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import AuthApi from '../../services/AuthApi.js';
import { ApiClientError } from '../../services/apiClient.js';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../services/PropertyApi.js', () => ({ default: { search: vi.fn() } }));
vi.mock('../../services/AuthApi.js', () => ({
  default: { verifyRegistrationOtp: vi.fn(), resendOtp: vi.fn(), cancelRegistration: vi.fn() },
}));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => <div />,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
}));
vi.mock('leaflet', () => ({ default: { Icon: class MockIcon {} } }));

function renderLandingPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

// The register-flow tests type every field of the form; under the full suite's
// parallel load that can exceed vitest's default 5000ms per test (they pass
// reliably alone). Same headroom as PropertyFormPage.test.jsx.
vi.setConfig({ testTimeout: 15000 });

describe('LandingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({
      login: vi.fn(),
      register: vi.fn(),
      verifyLoginOtp: vi.fn(),
      mfaChallenge: null,
      user: null,
    });
    PropertyApi.search.mockResolvedValue({ properties: [] });
  });
  afterEach(() => {
    useAuthMock.mockReset();
  });

  it('renders the nav links that jump to the About, Team, and Contact sections', () => {
    renderLandingPage();
    expect(screen.getByRole('link', { name: 'About Platform' })).toHaveAttribute('href', '#about');
    expect(screen.getByRole('link', { name: 'Team' })).toHaveAttribute('href', '#team');
    expect(screen.getByRole('link', { name: 'Contact Us' })).toHaveAttribute('href', '#contact');
  });

  it('shows the Login form by default in the Hero and lets the visitor slide to Register without navigating away', async () => {
    const user = userEvent.setup();
    renderLandingPage();

    expect(screen.getByRole('heading', { name: /^login$/i })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /register now/i })[0]);

    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    // Still the same document/page — no route change, no unmount of the merged content sections.
    expect(screen.getByText(/built for dagupan city/i)).toBeInTheDocument();
  });

  it('slides back to Login from the Register overlay', async () => {
    const user = userEvent.setup();
    renderLandingPage();

    await user.click(screen.getAllByRole('button', { name: /register now/i })[0]);
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: /^login$/i })[0]);
    expect(screen.getByRole('heading', { name: /^login$/i })).toBeInTheDocument();
  });

  it('submits the Hero login form through the real auth logic', async () => {
    const login = vi.fn().mockResolvedValue({ mfaRequired: false });
    useAuthMock.mockReturnValue({ login, register: vi.fn(), verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLandingPage();

    // Both the (hidden) Register panel and the Login panel are always mounted for the
    // cross-fade, so "Password" matches two inputs — scope to the Login form's own field.
    const loginPanel = within(screen.getByRole('heading', { name: /^login$/i }).parentElement);
    await user.type(loginPanel.getByPlaceholderText('Email address'), 'demo.tenant@gmail.com');
    await user.type(loginPanel.getByPlaceholderText('Password'), 'Demo123!Pass');
    await user.click(loginPanel.getByRole('button', { name: /^login$/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({ email: 'demo.tenant@gmail.com', password: 'Demo123!Pass' });
    });
  });

  it('shows "This email is not registered." with a Register now action that slides to the Register panel (no navigation)', async () => {
    const login = vi.fn().mockRejectedValue(new ApiClientError('This email is not registered.', 'EMAIL_NOT_REGISTERED', 401));
    useAuthMock.mockReturnValue({ login, register: vi.fn(), verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLandingPage();

    const loginPanel = within(screen.getByRole('heading', { name: /^login$/i }).parentElement);
    await user.type(loginPanel.getByPlaceholderText('Email address'), 'nonexistent@gmail.com');
    await user.type(loginPanel.getByPlaceholderText('Password'), 'Whatever1!');
    await user.click(loginPanel.getByRole('button', { name: /^login$/i }));

    expect(await loginPanel.findByText('This email is not registered.')).toBeInTheDocument();
    await user.click(loginPanel.getByRole('button', { name: /register now/i }));

    // Same in-place slide the rest of this component uses — never navigate().
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
  });

  it('blocks the Hero login submit and shows inline errors for an empty email and empty password, without calling login', async () => {
    const login = vi.fn();
    useAuthMock.mockReturnValue({ login, register: vi.fn(), verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLandingPage();

    const loginPanel = within(screen.getByRole('heading', { name: /^login$/i }).parentElement);
    await user.click(loginPanel.getByRole('button', { name: /^login$/i }));

    expect(await loginPanel.findByText('Email is required.')).toBeInTheDocument();
    expect(loginPanel.getByText('Password is required.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('blocks the Hero login submit for a malformed email (e.g. gladdielugot@gamil.com) without calling login', async () => {
    const login = vi.fn();
    useAuthMock.mockReturnValue({ login, register: vi.fn(), verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLandingPage();

    const loginPanel = within(screen.getByRole('heading', { name: /^login$/i }).parentElement);
    await user.type(loginPanel.getByPlaceholderText('Email address'), 'gladdielugot@gamil.com');
    await user.type(loginPanel.getByPlaceholderText('Password'), 'Demo123!Pass');
    await user.click(loginPanel.getByRole('button', { name: /^login$/i }));

    expect(await loginPanel.findByText('Please enter a valid email address.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('validates the Hero login email on blur, before any submit attempt', async () => {
    useAuthMock.mockReturnValue({ login: vi.fn(), register: vi.fn(), verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    const user = userEvent.setup();
    renderLandingPage();

    const loginPanel = within(screen.getByRole('heading', { name: /^login$/i }).parentElement);
    await user.type(loginPanel.getByPlaceholderText('Email address'), 'Angelo@calaycay05');
    await user.tab();

    expect(await loginPanel.findByText('Please enter a valid email address.')).toBeInTheDocument();
  });

  it('renders the About, Features, Roles, SDG, Team, and Contact content sections', () => {
    renderLandingPage();
    expect(screen.getByRole('heading', { name: /everything you need to rent/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /designed for all stakeholders/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /modernizing traditional boarding houses/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /supporting un sustainable development goals/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /meet the development team/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /have questions or feedback/i })).toBeInTheDocument();
  });

  it('registers through the Hero form, verifies the OTP, and returns to Login without navigating', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ login: vi.fn(), register, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    AuthApi.verifyRegistrationOtp.mockResolvedValue({ message: 'Email verified. You can now log in.' });
    const user = userEvent.setup();
    renderLandingPage();

    await user.click(screen.getAllByRole('button', { name: /register now/i })[0]);
    const registerPanel = within(screen.getByRole('heading', { name: /create account/i }).parentElement);

    await user.type(registerPanel.getByPlaceholderText('First name'), 'Juan');
    await user.type(registerPanel.getByPlaceholderText('Last name'), 'Dela Cruz');
    await user.type(registerPanel.getByPlaceholderText('yourname@gmail.com'), 'juan.delacruz@gmail.com');
    await user.type(registerPanel.getByPlaceholderText('+639171234567'), '09171234567');
    await user.type(registerPanel.getByPlaceholderText('Password'), 'Str0ng!Pass');
    await user.type(registerPanel.getByPlaceholderText('Confirm password'), 'Str0ng!Pass');
    await user.type(registerPanel.getByPlaceholderText('Contact person'), 'Maria Dela Cruz');
    await user.type(registerPanel.getByPlaceholderText('CP number'), '09181234567');
    await user.click(registerPanel.getByRole('checkbox'));
    await user.click(registerPanel.getByRole('button', { name: /^register$/i }));

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

    await user.type(screen.getByPlaceholderText('123456'), '123456');
    await user.click(screen.getByRole('button', { name: /^verify email$/i }));

    expect(AuthApi.verifyRegistrationOtp).toHaveBeenCalledWith({ email: 'juan.delacruz@gmail.com', code: '123456' });
    expect(await screen.findByText(/registration successful/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /go to login/i }));
    expect(screen.getByRole('heading', { name: /^login$/i })).toBeInTheDocument();
  });

  it('cancels the Hero register form\'s pending verification and returns to the form, without treating it as a successful verification', async () => {
    const register = vi.fn().mockResolvedValue({});
    useAuthMock.mockReturnValue({ login: vi.fn(), register, verifyLoginOtp: vi.fn(), mfaChallenge: null, user: null });
    AuthApi.cancelRegistration.mockResolvedValue({ message: 'Registration cancelled. You can register again with the correct information.' });
    const user = userEvent.setup();
    renderLandingPage();

    await user.click(screen.getAllByRole('button', { name: /register now/i })[0]);
    const registerPanel = within(screen.getByRole('heading', { name: /create account/i }).parentElement);

    await user.type(registerPanel.getByPlaceholderText('First name'), 'Juan');
    await user.type(registerPanel.getByPlaceholderText('Last name'), 'Dela Cruz');
    await user.type(registerPanel.getByPlaceholderText('yourname@gmail.com'), 'juan.delacruz@gmail.com');
    await user.type(registerPanel.getByPlaceholderText('+639171234567'), '09171234567');
    await user.type(registerPanel.getByPlaceholderText('Password'), 'Str0ng!Pass');
    await user.type(registerPanel.getByPlaceholderText('Confirm password'), 'Str0ng!Pass');
    await user.type(registerPanel.getByPlaceholderText('Contact person'), 'Maria Dela Cruz');
    await user.type(registerPanel.getByPlaceholderText('CP number'), '09181234567');
    await user.click(registerPanel.getByRole('checkbox'));
    await user.click(registerPanel.getByRole('button', { name: /^register$/i }));

    expect(await screen.findByRole('heading', { name: /verify your email/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(AuthApi.cancelRegistration).toHaveBeenCalledWith({ email: 'juan.delacruz@gmail.com' });
    expect(await screen.findByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByText(/registration cancelled\. you can register again with the correct information\./i)).toBeInTheDocument();
  });

  it('renders the public property listing', async () => {
    PropertyApi.search.mockResolvedValue({
      properties: [
        {
          _id: 'p1',
          propertyName: 'Dagupan Demo Boarding House',
          propertyType: 'Bedspace',
          tenantGenderPolicy: 'Co-Ed',
          address: { barangay: 'Bonuan', city: 'Dagupan' },
          images: [],
        },
      ],
    });
    renderLandingPage();

    expect(await screen.findByText('Dagupan Demo Boarding House')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dagupan Demo Boarding House/i })).toHaveAttribute('href', '/properties/p1');
  });
});
