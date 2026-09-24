import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiscoverPage from './DiscoverPage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

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
});
