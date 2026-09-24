import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import UnauthorizedPage from './UnauthorizedPage.jsx';

describe('UnauthorizedPage', () => {
  it('renders a 403 message with a link home', () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/403/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
  });
});
