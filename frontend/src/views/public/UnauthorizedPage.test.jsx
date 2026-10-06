import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UnauthorizedPage from './UnauthorizedPage.jsx';
import { mockAuthValue } from '../../test/mockContexts.js';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));

describe('UnauthorizedPage', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: null, status: 'unauthenticated' }));
  });

  it('renders a 403 message with a link home', () => {
    render(
      <MemoryRouter>
        <UnauthorizedPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/403/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go home/i })).toHaveAttribute('href', '/');
  });

  it("Back takes a signed-in user to their own home when there is no previous page", async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { fullName: 'Tina Tenant', role: 'tenant' } }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/unauthorized']}>
        <Routes>
          <Route path="/tenant/discover" element={<p>Tenant Discover</p>} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByText('Tenant Discover')).toBeInTheDocument();
  });
});
