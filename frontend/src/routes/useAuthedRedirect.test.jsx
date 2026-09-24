import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuthedRedirect } from './useAuthedRedirect.js';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));

function PublicPage() {
  useAuthedRedirect();
  return <p>Public page</p>;
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<PublicPage />} />
        <Route path="/tenant/discover" element={<p>Tenant home</p>} />
        <Route path="/" element={<p>Root</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('useAuthedRedirect', () => {
  it('stays on the public page while unauthenticated', () => {
    useAuthMock.mockReturnValue({ user: null, status: 'unauthenticated' });
    renderAt('/login');
    expect(screen.getByText('Public page')).toBeInTheDocument();
  });

  it('redirects an authenticated user to their role home', () => {
    useAuthMock.mockReturnValue({ user: { role: 'tenant' }, status: 'authenticated' });
    renderAt('/login');
    expect(screen.getByText('Tenant home')).toBeInTheDocument();
  });

  it('falls back to / for a role with no configured home', () => {
    useAuthMock.mockReturnValue({ user: { role: 'ghost' }, status: 'authenticated' });
    renderAt('/login');
    expect(screen.getByText('Root')).toBeInTheDocument();
  });

  it('does not redirect while status is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, status: 'loading' });
    renderAt('/login');
    expect(screen.getByText('Public page')).toBeInTheDocument();
  });
});
