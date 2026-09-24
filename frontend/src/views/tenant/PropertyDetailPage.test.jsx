import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PropertyDetailPage from './PropertyDetailPage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/PropertyApi.js', () => ({ default: { getPublicDetail: vi.fn() } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => <div />,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
}));
vi.mock('leaflet', () => ({ default: { Icon: class MockIcon {} } }));

describe('PropertyDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', fullName: 'Juan Dela Cruz', role: 'tenant' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('renders PropertyDetailContent for the routed property id inside the dashboard layout', async () => {
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
      <MemoryRouter initialEntries={['/tenant/properties/p1']}>
        <Routes>
          <Route path="/tenant/properties/:id" element={<PropertyDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'Dagupan Demo Boarding House' })).toBeInTheDocument();
    expect(PropertyApi.getPublicDetail).toHaveBeenCalledWith('p1');
  });
});
