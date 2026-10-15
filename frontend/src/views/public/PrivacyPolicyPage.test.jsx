import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PrivacyPolicyPage from './PrivacyPolicyPage.jsx';

describe('PrivacyPolicyPage', () => {
  it('shows the full policy publicly, with a link back home', () => {
    render(<MemoryRouter><PrivacyPolicyPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.getByText('Information We Collect')).toBeInTheDocument();
    expect(screen.getByText('Location (GPS) Information')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to ledger onboard/i })).toHaveAttribute('href', '/');
  });
});
