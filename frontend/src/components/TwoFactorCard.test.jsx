import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TwoFactorCard from './TwoFactorCard.jsx';
import AuthApi from '../services/AuthApi.js';
import { ApiClientError } from '../services/apiClient.js';

vi.mock('../services/AuthApi.js', () => ({
  default: { mfaSetup: vi.fn(), mfaEnable: vi.fn(), mfaDisable: vi.fn(), mfaRegenerateBackupCodes: vi.fn(), mfaEmailSetup: vi.fn(), mfaEmailEnable: vi.fn(), mfaEmailCode: vi.fn() },
}));

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const SETUP = {
  otpauthUri: `otpauth://totp/Ledger%20OnBoard:juan%40gmail.com?secret=${SECRET}&issuer=Ledger%20OnBoard&algorithm=SHA1&digits=6&period=30`,
  secret: SECRET,
  issuer: 'Ledger OnBoard',
  accountName: 'juan@gmail.com',
};
const BACKUP_CODES = ['ABCDE-FGHJK', 'MNPQR-STUVW', 'XYZ23-45678', 'A2B3C-D4E5F', 'G6H7J-K8M9N', 'PQRST-UVWXY', 'Z2345-6789A', 'BCDEF-GHJKM', 'NPQRS-TUVWX', 'YZ234-56789'];
const OFF = { email: 'juan@gmail.com', mfaEnabled: false, mfaMethod: 'none' };
const ON = { email: 'juan@gmail.com', mfaEnabled: true, mfaMethod: 'totp' };

function renderCard(user = OFF) {
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(<TwoFactorCard user={user} onChanged={onChanged} />);
  return { onChanged };
}

async function goToScanStep(user) {
  AuthApi.mfaSetup.mockResolvedValue(SETUP);
  await user.click(screen.getByRole('button', { name: /set up two-factor/i }));
  await user.type(screen.getByLabelText(/current password/i), 'Str0ng!Pass');
  await user.click(screen.getByRole('button', { name: /^continue$/i }));
  await screen.findByAltText(/qr code/i);
}

describe('TwoFactorCard', () => {
  it('email restoration: verifies a mailed code before enabling email two-factor without a QR', async () => {
    AuthApi.mfaEmailSetup.mockResolvedValue({ message: 'Check your email for a verification code.' });
    AuthApi.mfaEmailEnable.mockResolvedValue({ user: { ...OFF, mfaEnabled: true, mfaMethod: 'email', emailMfaEnrolled: true } });
    const person = userEvent.setup();
    const { onChanged } = renderCard({ ...OFF, emailAccountFlowsAvailable: true });
    await person.click(screen.getByRole('button', { name: /set up email codes/i }));
    await person.type(screen.getByLabelText(/current password/i), 'Str0ng!Pass');
    await person.click(screen.getByRole('button', { name: /^continue$/i }));
    expect(AuthApi.mfaEmailSetup).toHaveBeenCalledWith({ password: 'Str0ng!Pass' });
    await person.type(await screen.findByLabelText('Email verification code'), '12a34 56');
    await person.click(screen.getByRole('button', { name: /^turn on$/i }));
    expect(AuthApi.mfaEmailEnable).toHaveBeenCalledWith({ code: '123456' });
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByAltText(/qr code/i)).not.toBeInTheDocument();
  });

  it('email restoration: requires a settings email code to turn email two-factor off', async () => {
    AuthApi.mfaEmailCode.mockResolvedValue({ message: 'Check your email for a verification code.' });
    AuthApi.mfaDisable.mockResolvedValue({ user: OFF });
    const person = userEvent.setup();
    const { onChanged } = renderCard({ ...OFF, mfaEnabled: true, mfaMethod: 'email', emailMfaEnrolled: true });
    expect(screen.getByText(/signing in asks for a code sent to your email/i)).toBeInTheDocument();
    await person.click(screen.getByRole('button', { name: /^turn off$/i }));
    await person.type(screen.getByLabelText(/current password/i), 'Str0ng!Pass');
    await person.click(screen.getByRole('button', { name: /send email code/i }));
    expect(AuthApi.mfaEmailCode).toHaveBeenCalledWith({ password: 'Str0ng!Pass' });
    await person.type(await screen.findByLabelText('Email verification code'), '123456');
    await person.click(screen.getByRole('button', { name: /turn off two-factor/i }));
    expect(AuthApi.mfaDisable).toHaveBeenCalledWith({ password: 'Str0ng!Pass', code: '123456' });
    expect(onChanged).toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setting up', () => {
    it('asks for the password, then shows a QR code drawn in the browser and the manual key', async () => {
      const user = userEvent.setup();
      renderCard();

      expect(screen.getByText(/google authenticator or microsoft authenticator/i)).toBeInTheDocument();
      await goToScanStep(user);

      expect(AuthApi.mfaSetup).toHaveBeenCalledWith({ password: 'Str0ng!Pass' });
      const qr = screen.getByAltText(/qr code/i);
      expect(qr.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
      expect(decodeURIComponent(qr.getAttribute('src'))).toContain('<svg');
      expect(screen.getByTestId('mfa-manual-key')).toHaveTextContent('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP');
      expect(screen.getByText(/issuer: ledger onboard/i)).toBeInTheDocument();
    });

    it('shows a wrong password from the server and stays on the password step', async () => {
      AuthApi.mfaSetup.mockRejectedValue(new ApiClientError('Current password is incorrect', 'INVALID_CURRENT_PASSWORD', 400));
      const user = userEvent.setup();
      renderCard();

      await user.click(screen.getByRole('button', { name: /set up two-factor/i }));
      await user.type(screen.getByLabelText(/current password/i), 'Wrong1!Pass');
      await user.click(screen.getByRole('button', { name: /^continue$/i }));

      expect(await screen.findByText('Current password is incorrect')).toBeInTheDocument();
      expect(screen.queryByAltText(/qr code/i)).not.toBeInTheDocument();
    });
  });

  describe('confirming', () => {
    it('turns two-factor on with a code from the app, then shows the backup codes once', async () => {
      AuthApi.mfaEnable.mockResolvedValue({ backupCodes: BACKUP_CODES, user: ON });
      const user = userEvent.setup();
      const { onChanged } = renderCard();
      await goToScanStep(user);

      const turnOn = screen.getByRole('button', { name: /^turn on$/i });
      expect(turnOn).toBeDisabled();
      await user.type(screen.getByLabelText(/code from the app/i), '12a34 56');
      expect(screen.getByLabelText(/code from the app/i)).toHaveValue('123456');
      await user.click(turnOn);

      expect(AuthApi.mfaEnable).toHaveBeenCalledWith({ code: '123456' });
      const list = await screen.findByRole('list', { name: /backup codes/i });
      expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(BACKUP_CODES);
      expect(screen.getByText('Two-factor sign-in is on.')).toBeInTheDocument();
      expect(onChanged).toHaveBeenCalled();
      // The secret is gone from the page once confirmed.
      expect(screen.queryByAltText(/qr code/i)).not.toBeInTheDocument();
      expect(screen.queryByTestId('mfa-manual-key')).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /i've saved my codes/i }));
      expect(screen.queryByRole('list', { name: /backup codes/i })).not.toBeInTheDocument();
    });

    it('shows a wrong code and lets the person try again', async () => {
      AuthApi.mfaEnable.mockRejectedValueOnce(new ApiClientError('Invalid or expired code', 'INVALID_OTP', 400));
      const user = userEvent.setup();
      renderCard();
      await goToScanStep(user);

      await user.type(screen.getByLabelText(/code from the app/i), '000000');
      await user.click(screen.getByRole('button', { name: /^turn on$/i }));

      expect(await screen.findByText('Invalid or expired code')).toBeInTheDocument();
      expect(screen.getByAltText(/qr code/i)).toBeInTheDocument();
    });

    it('copies the backup codes and saves them as a file', async () => {
      AuthApi.mfaEnable.mockResolvedValue({ backupCodes: BACKUP_CODES, user: ON });
      const user = userEvent.setup();
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
      URL.createObjectURL = vi.fn(() => 'blob:codes');
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      renderCard();
      await goToScanStep(user);
      await user.type(screen.getByLabelText(/code from the app/i), '123456');
      await user.click(screen.getByRole('button', { name: /^turn on$/i }));
      await screen.findByRole('list', { name: /backup codes/i });

      await user.click(screen.getByRole('button', { name: /copy codes/i }));
      expect(writeText).toHaveBeenCalledWith(BACKUP_CODES.join('\n'));
      expect(await screen.findByRole('button', { name: /^copied$/i })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /save as file/i }));
      expect(click).toHaveBeenCalled();
      const blob = URL.createObjectURL.mock.calls[0][0];
      const text = await blob.text();
      for (const code of BACKUP_CODES) expect(text).toContain(code);
      expect(text).toContain('juan@gmail.com');
    });
  });

  describe('when on', () => {
    it('turns two-factor off with the password and a code', async () => {
      AuthApi.mfaDisable.mockResolvedValue({ user: OFF });
      const user = userEvent.setup();
      const { onChanged } = renderCard(ON);

      expect(screen.getByText('Two-factor sign-in is on.')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /^turn off$/i }));
      const submit = screen.getByRole('button', { name: /turn off two-factor/i });
      expect(submit).toBeDisabled();
      await user.type(screen.getByLabelText(/current password/i), 'Str0ng!Pass');
      await user.type(screen.getByLabelText(/authenticator or backup code/i), 'abcde-fghjk');
      await user.click(submit);

      expect(AuthApi.mfaDisable).toHaveBeenCalledWith({ password: 'Str0ng!Pass', code: 'ABCDE-FGHJK' });
      expect(await screen.findByText('Two-factor sign-in is off.')).toBeInTheDocument();
      expect(onChanged).toHaveBeenCalled();
    });

    it('keeps two-factor on when the code is wrong', async () => {
      AuthApi.mfaDisable.mockRejectedValue(new ApiClientError('Invalid or expired code', 'INVALID_OTP', 400));
      const user = userEvent.setup();
      const { onChanged } = renderCard(ON);

      await user.click(screen.getByRole('button', { name: /^turn off$/i }));
      await user.type(screen.getByLabelText(/current password/i), 'Str0ng!Pass');
      await user.type(screen.getByLabelText(/authenticator or backup code/i), '000000');
      await user.click(screen.getByRole('button', { name: /turn off two-factor/i }));

      expect(await screen.findByText('Invalid or expired code')).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('replaces the backup codes and shows the new ones once', async () => {
      AuthApi.mfaRegenerateBackupCodes.mockResolvedValue({ backupCodes: BACKUP_CODES });
      const user = userEvent.setup();
      renderCard(ON);

      await user.click(screen.getByRole('button', { name: /get new backup codes/i }));
      await user.type(screen.getByLabelText(/current password/i), 'Str0ng!Pass');
      await user.type(screen.getByLabelText(/authenticator or backup code/i), '123456');
      await user.click(screen.getByRole('button', { name: /get new backup codes/i }));

      expect(AuthApi.mfaRegenerateBackupCodes).toHaveBeenCalledWith({ password: 'Str0ng!Pass', code: '123456' });
      expect(await screen.findByText(/the old ones no longer work/i)).toBeInTheDocument();
      expect(within(screen.getByRole('list', { name: /backup codes/i })).getAllByRole('listitem')).toHaveLength(10);
    });

    it('treats the retired email two-factor as not set up', () => {
      renderCard({ email: 'juan@gmail.com', mfaEnabled: true, mfaMethod: 'email' });
      expect(screen.getByRole('button', { name: /set up two-factor/i })).toBeInTheDocument();
      expect(screen.queryByText('Two-factor sign-in is on.')).not.toBeInTheDocument();
    });
  });

  it('never mentions email codes', async () => {
    renderCard();
    await waitFor(() => expect(screen.queryByText(/we.ll email/i)).not.toBeInTheDocument());
    expect(screen.getByText(/no code is ever sent to you/i)).toBeInTheDocument();
  });
});
