import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessVerificationPage from './BusinessVerificationPage.jsx';
import LandlordVerificationApi from '../../services/LandlordVerificationApi.js';

vi.mock('../../components/layout/DashboardLayout.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: { businessVerificationStatus: null }, refreshProfile: vi.fn() }) }));
vi.mock('../../services/LandlordVerificationApi.js', () => ({ default: { getMine: vi.fn(), submit: vi.fn() } }));
const photo = (name = 'permit.png') => new File(['fixture image'], name, { type: 'image/png' });

describe('Business verification document controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    LandlordVerificationApi.getMine.mockResolvedValue({ submission: null });
    URL.createObjectURL = vi.fn(() => 'blob:fixture');
    URL.revokeObjectURL = vi.fn();
  });

  it('the Choose file control opens the actual document input', async () => {
    const nativeClick = vi.spyOn(HTMLInputElement.prototype, 'click');
    const user = userEvent.setup(); render(<BusinessVerificationPage />);
    await user.click((await screen.findAllByRole('button', { name: 'Choose file' }))[0]);
    expect(nativeClick).toHaveBeenCalled();
    nativeClick.mockRestore();
  });

  it('a selected file can be previewed, closed, removed, and the same file chosen again', async () => {
    const user = userEvent.setup(); render(<BusinessVerificationPage />);
    const input = await screen.findByLabelText("Mayor's / Business Permit");
    const file = photo(); await user.upload(input, file);
    expect(screen.getByText(file.name)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /view.*permit/i }));
    const dialog = screen.getByRole('dialog', { name: /document preview/i });
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', 'blob:fixture');
    await user.click(within(dialog).getByRole('button', { name: /close preview/i }));
    await user.click(screen.getByRole('button', { name: /remove.*permit/i }));
    expect(screen.queryByText(file.name)).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
    await user.upload(input, file);
    expect(screen.getByText(file.name)).toBeInTheDocument();
  });

  it('invalid dropped replacements keep the selected document and explain the rejection', async () => {
    const user = userEvent.setup(); render(<BusinessVerificationPage />);
    const input = await screen.findByLabelText("Mayor's / Business Permit");
    await user.upload(input, photo());
    const zone = input.closest('[data-document-upload]') || input.closest('label');
    fireEvent.drop(zone, { dataTransfer: { files: [new File(['bad'], 'bad.txt', { type: 'text/plain' })] } });
    expect(screen.getByText('permit.png')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Only PDF, JPG, PNG or WebP');
  });
});
