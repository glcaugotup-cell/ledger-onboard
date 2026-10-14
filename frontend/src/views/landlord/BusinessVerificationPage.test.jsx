import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessVerificationPage from './BusinessVerificationPage.jsx';
import LandlordVerificationApi from '../../services/LandlordVerificationApi.js';

vi.mock('../../components/layout/DashboardLayout.jsx', () => ({ default: ({ children }) => <div>{children}</div> }));
const { authUser } = vi.hoisted(() => ({ authUser: { businessVerificationStatus: null } }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: () => ({ user: authUser, refreshProfile: vi.fn() }) }));
vi.mock('../../services/LandlordVerificationApi.js', () => ({ default: { getMine: vi.fn(), submit: vi.fn(), fetchDocument: vi.fn(), replaceDocuments: vi.fn() } }));
const photo = (name = 'permit.png') => new File(['fixture image'], name, { type: 'image/png' });

describe('Business verification document controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authUser.businessVerificationStatus = null;
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

describe('Replacing documents while the submission is pending review', () => {
  const pending = { _id: 'v1', status: 'PENDING', submittedAt: '2026-10-14T02:59:00Z', documentsUpdatedAt: null };

  beforeEach(() => {
    vi.clearAllMocks();
    authUser.businessVerificationStatus = 'PENDING';
    LandlordVerificationApi.getMine.mockResolvedValue({ submission: pending });
    URL.revokeObjectURL = vi.fn();
  });

  it('lists both submitted documents and shows one inside the page', async () => {
    LandlordVerificationApi.fetchDocument.mockResolvedValue({ url: 'blob:permit', type: 'image/png' });
    const user = userEvent.setup();
    render(<BusinessVerificationPage />);

    expect(await screen.findByText('Submitted documents')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace BIR Form 2303' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: "View Mayor's / Business Permit" }));
    expect(LandlordVerificationApi.fetchDocument).toHaveBeenCalledWith('v1', 'permit');
    const dialog = await screen.findByRole('dialog', { name: "Mayor's / Business Permit" });
    expect(within(dialog).getByRole('img', { name: "Preview of Mayor's / Business Permit" })).toHaveAttribute('src', 'blob:permit');
    await user.click(within(dialog).getByRole('button', { name: 'Close preview' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:permit');
  });

  it('replaces one document and confirms it', async () => {
    LandlordVerificationApi.replaceDocuments.mockResolvedValue({ submission: { ...pending, documentsUpdatedAt: '2026-10-14T03:20:00Z' } });
    const user = userEvent.setup();
    render(<BusinessVerificationPage />);

    const file = photo('right-permit.png');
    await user.upload(await screen.findByLabelText("New file for Mayor's / Business Permit"), file);
    await waitFor(() => expect(LandlordVerificationApi.replaceDocuments).toHaveBeenCalledTimes(1));
    const [id, formData] = LandlordVerificationApi.replaceDocuments.mock.calls[0];
    expect(id).toBe('v1');
    expect(formData.get('mayorBusinessPermit')).toBe(file);
    expect(formData.get('birForm2303')).toBeNull();
    expect(await screen.findByText("Mayor's / Business Permit replaced. The admin will review the new file.")).toBeInTheDocument();
    expect(screen.getByText(/^Last updated /)).toBeInTheDocument();
  });

  it('refuses a wrong file type before uploading, and shows the server error when the admin already decided', async () => {
    LandlordVerificationApi.replaceDocuments.mockRejectedValue(Object.assign(new Error('This submission has already been reviewed'), { code: 'SUBMISSION_ALREADY_REVIEWED', status: 409 }));
    render(<BusinessVerificationPage />);

    const input = await screen.findByLabelText('New file for BIR Form 2303');
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } });
    expect(await screen.findByText('Only PDF, JPG, PNG or WebP files are accepted.')).toBeInTheDocument();
    expect(LandlordVerificationApi.replaceDocuments).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [new File(['%PDF'], 'bir.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText('This submission has already been reviewed')).toBeInTheDocument();
  });
});
