import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute.jsx';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));

function renderProtected({ roles } = {}) {
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route path="/" element={<div>Landing page</div>} />
        <Route path="/unauthorized" element={<div>Unauthorized page</div>} />
        <Route element={<ProtectedRoute roles={roles} />}>
          <Route path="/protected" element={<div>Secret content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  afterEach(() => {
    useAuthMock.mockReset();
  });

  it('shows a loading state while auth status is resolving', () => {
    useAuthMock.mockReturnValue({ user: null, status: 'loading' });
    renderProtected();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('redirects to the landing page (not /login) when unauthenticated', () => {
    useAuthMock.mockReturnValue({ user: null, status: 'unauthenticated' });
    renderProtected();
    expect(screen.getByText('Landing page')).toBeInTheDocument();
  });

  it('redirects to /unauthorized when the role is not permitted', () => {
    useAuthMock.mockReturnValue({ user: { role: 'tenant' }, status: 'authenticated' });
    renderProtected({ roles: ['admin'] });
    expect(screen.getByText('Unauthorized page')).toBeInTheDocument();
  });

  it('renders the protected content when authenticated with a permitted role', () => {
    useAuthMock.mockReturnValue({ user: { role: 'admin' }, status: 'authenticated' });
    renderProtected({ roles: ['admin'] });
    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });

  it('renders the protected content when no roles restriction is given', () => {
    useAuthMock.mockReturnValue({ user: { role: 'tenant' }, status: 'authenticated' });
    renderProtected();
    expect(screen.getByText('Secret content')).toBeInTheDocument();
  });
});
