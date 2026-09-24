import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
