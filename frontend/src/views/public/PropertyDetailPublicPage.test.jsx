import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PropertyDetailPublicPage from './PropertyDetailPublicPage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { mockAuthValue } from '../../test/mockContexts.js';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../services/PropertyApi.js', () => ({ default: { getPublicDetail: vi.fn() } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => <div />,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
}));
vi.mock('leaflet', () => ({ default: { Icon: class MockIcon {} } }));

describe('PropertyDetailPublicPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: null, status: 'unauthenticated' }));
  });

  it('renders a Sign in link and the property detail for an anonymous visitor', async () => {
    PropertyApi.getPublicDetail.mockResolvedValue({
      property: {
        _id: 'p1',
        propertyName: 'Dagupan Demo Boarding House',
        propertyType: 'Bedspace',
        tenantGenderPolicy: 'Co-Ed',
        address: { street: '123 Main St', barangay: 'Bonuan', city: 'Dagupan', province: 'Pangasinan' },
        description: 'A cozy place.',
        amenities: [],
        houseRules: [],
        images: [],
        locationCoordinates: { lat: 16.05, lng: 120.34 },
      },
      rooms: [],
      reviews: [],
    });

    render(
      <MemoryRouter initialEntries={['/properties/p1']}>
        <Routes>
          <Route path="/properties/:id" element={<PropertyDetailPublicPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/');
    expect(await screen.findByRole('heading', { name: 'Dagupan Demo Boarding House' })).toBeInTheDocument();
  });
});
