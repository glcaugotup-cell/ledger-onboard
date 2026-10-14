import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddAdminDialog from './AddAdminDialog.jsx';
import AdminApi from '../services/AdminApi.js';

vi.mock('../services/AdminApi.js', () => ({ default: { createAdmin: vi.fn() } }));

const CREATED = { user: { _id: 'a9', fullName: 'Bea Santos' }, code: 'WXYZ-2345', expiresAt: new Date(Date.now() + 1800000).toISOString() };

const box = (name) => screen.getByRole('textbox', { name });
const submit = (user) => user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^add admin$/i }));

async function fill(user, { first = 'bea', last = 'santos', gmail = 'bea', phone = '09175550101' } = {}) {
  await user.type(box('First name'), first);
  await user.type(box('Last name'), last);
  await user.type(box('Gmail username'), gmail);
  await user.type(box('Phone'), phone);
}

describe('AddAdminDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    AdminApi.createAdmin.mockResolvedValue(CREATED);
  });

  it('raises the first letter of each name while typing and keeps only letters, spaces and apostrophes', async () => {
    const user = userEvent.setup();
    render(<AddAdminDialog onClose={() => {}} />);
    await user.type(box('First name'), 'gladdiel2');
    await user.type(box('Last name'), "o'gOT");
    expect(box('First name')).toHaveValue('Gladdiel');
    expect(box('Last name')).toHaveValue("O'gOT");

    await user.type(box('Gmail username'), 'gladdielugo');
    await user.type(box('Phone'), '09175550101');
    await submit(user);
    // Saved the way the server stores names.
    expect(AdminApi.createAdmin).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Gladdiel', lastName: "O'Got" }));
  });

  it('has a fixed "@gmail.com" ending and a +63 phone by default', async () => {
    const user = userEvent.setup();
    render(<AddAdminDialog onClose={() => {}} />);
    expect(screen.getByText('@gmail.com')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Country code' })).toHaveValue('PH');

    // A pasted full address keeps only the username.
    await user.click(box('Gmail username'));
    await user.paste('Bea.Santos@gmail.com');
    expect(box('Gmail username')).toHaveValue('Bea.Santos');
    await user.type(box('First name'), 'bea');
    await user.type(box('Last name'), 'santos');
    await user.type(box('Phone'), '0917 555 0101');
    expect(box('Phone')).toHaveValue('9175550101');
    await submit(user);

    expect(AdminApi.createAdmin).toHaveBeenCalledWith({ firstName: 'Bea', lastName: 'Santos', email: 'bea.santos@gmail.com', phone: '+639175550101' });
    expect(await screen.findByTestId('setup-code')).toHaveTextContent('WXYZ-2345');
  });

  it('adds an admin with a phone number from another country', async () => {
    const user = userEvent.setup();
    render(<AddAdminDialog onClose={() => {}} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Country code' }), 'GB');
    expect(box('Phone')).toHaveAttribute('placeholder', '7400 123456');
    await fill(user, { phone: '07400123456' });
    await submit(user);
    expect(AdminApi.createAdmin).toHaveBeenCalledWith(expect.objectContaining({ phone: '+447400123456' }));
  });

  it('shows each problem under its field before sending, and clears it once the field is edited', async () => {
    const user = userEvent.setup();
    render(<AddAdminDialog onClose={() => {}} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Country code' }), 'AU');
    await fill(user, { first: 'b', phone: '0412' });
    await submit(user);

    expect(AdminApi.createAdmin).not.toHaveBeenCalled();
    expect(screen.getByText('Must contain at least 2 letters')).toBeInTheDocument();
    expect(screen.getByText(/valid Australia mobile number \(e\.g\. \+61 412 345 678\)/)).toBeInTheDocument();
    expect(screen.queryByText('Validation failed')).not.toBeInTheDocument();

    await user.type(box('Phone'), '345678');
    expect(screen.queryByText(/valid Australia mobile number/)).not.toBeInTheDocument();
    expect(screen.getByText('Must contain at least 2 letters')).toBeInTheDocument();
    await user.type(box('First name'), 'ea');
    await submit(user);
    await waitFor(() => expect(AdminApi.createAdmin).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Bea', phone: '+61412345678' })));
  });

  it('shows server field errors under the fields', async () => {
    AdminApi.createAdmin.mockRejectedValue(Object.assign(new Error('Validation failed'), {
      status: 400, code: 'VALIDATION_ERROR', details: [{ field: 'email', message: 'Email must be a valid @gmail.com address' }],
    }));
    const user = userEvent.setup();
    render(<AddAdminDialog onClose={() => {}} />);
    await fill(user);
    await submit(user);
    expect(await screen.findByText('Email must be a valid @gmail.com address')).toBeInTheDocument();
  });
});
