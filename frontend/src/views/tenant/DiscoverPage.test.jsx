import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiscoverPage from './DiscoverPage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { mockAuthValue, mockNotificationsValue, VERIFIED_STUDENT_FIELDS } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/PropertyApi.js', () => ({ default: { search: vi.fn() } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => <div />,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn(), flyTo: vi.fn(), getZoom: () => 13 }),
}));
vi.mock('leaflet', () => ({ default: { Icon: class MockIcon {} } }));

describe('DiscoverPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', fullName: 'Juan Dela Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
    PropertyApi.search.mockResolvedValue({ properties: [] });
  });

  it('renders the heading and delegates listing to DiscoverContent with the tenant link prefix', async () => {
    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Discover boarding houses' })).toBeInTheDocument();
    expect(await screen.findByText(/no properties match your filters/i)).toBeInTheDocument();
  });

  it('shows the subtitle and the permanent map section', async () => {
    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Find a comfortable place to stay around Dagupan City.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Find boarding houses on the map' })).toBeInTheDocument();
    expect(await screen.findByText('No boarding houses match your current filters.')).toBeInTheDocument();
  });

  // User rule (2026-10-16): students can browse right away; reserving waits for an approved school ID.
  it('tells an unverified student to verify their ID, with a link; nothing for a verified one', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Verify your student ID before reserving a room.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Verify your student ID' })).toHaveAttribute('href', '/tenant/verification');
    unmount();

    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', fullName: 'Juan Dela Cruz', role: 'tenant', ...VERIFIED_STUDENT_FIELDS } }));
    render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    );
    expect(screen.queryByText(/Verify your student ID/)).not.toBeInTheDocument();
  });
});
