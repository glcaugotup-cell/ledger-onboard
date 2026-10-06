import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import AuthLayout from './AuthLayout.jsx';

describe('AuthLayout', () => {
  it('renders the title, subtitle, brand link, and children', () => {
    render(
      <MemoryRouter>
        <AuthLayout title="Welcome back" subtitle="Sign in to continue">
          <p>Form goes here</p>
        </AuthLayout>
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ledger OnBoard' })).toHaveAttribute('href', '/');
    expect(screen.getByText('Form goes here')).toBeInTheDocument();
  });

  it('"Back to sign in" returns to the landing page (its sliding sign-in card), not a separate login screen', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/login', '/forgot-password']} initialIndex={1}>
        <Routes>
          <Route path="/" element={<p>Landing with sign-in card</p>} />
          <Route path="/login" element={<p>Standalone login</p>} />
          <Route path="/forgot-password" element={<AuthLayout title="Forgot your password?"><p>Form</p></AuthLayout>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByText('Landing with sign-in card')).toBeInTheDocument();
  });

  it('omits the subtitle paragraph when none is given', () => {
    render(
      <MemoryRouter>
        <AuthLayout title="Invalid link">
          <p>Details</p>
        </AuthLayout>
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Invalid link' })).toBeInTheDocument();
  });
});
