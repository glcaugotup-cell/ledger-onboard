import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import PropertyMap from './PropertyMap.jsx';

// react-leaflet requires real layout/measurement machinery that jsdom
// doesn't provide; stub it with plain divs that record the props Leaflet
// would otherwise consume, so this test exercises PropertyMap's own logic
// (marker filtering, popup content) without depending on Leaflet internals.
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center, zoom }) => (
    <div data-testid="map-container" data-center={JSON.stringify(center)} data-zoom={zoom}>
      {children}
    </div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children, position }) => (
    <div data-testid="marker" data-position={JSON.stringify(position)}>
      {children}
    </div>
  ),
  Popup: ({ children }) => <div data-testid="popup">{children}</div>,
}));
vi.mock('leaflet', () => ({
  default: { Icon: class MockIcon {} },
}));

const propertyWithCoords = {
  _id: 'p1',
  propertyName: 'Dagupan Demo Boarding House',
  address: { barangay: 'Bonuan', city: 'Dagupan' },
  locationCoordinates: { lat: 16.05, lng: 120.34 },
};
const propertyWithoutCoords = { _id: 'p2', propertyName: 'No Coordinates House', address: {}, locationCoordinates: {} };

function renderMap(props) {
  return render(
    <MemoryRouter>
      <PropertyMap {...props} />
    </MemoryRouter>
  );
}

describe('PropertyMap', () => {
  it('centers on Dagupan City by default', () => {
    renderMap({ properties: [] });
    expect(screen.getByTestId('map-container')).toHaveAttribute('data-center', JSON.stringify([16.0433, 120.3333]));
  });

  it('uses an explicit center when given one', () => {
    renderMap({ properties: [], center: [16.05, 120.34] });
    expect(screen.getByTestId('map-container')).toHaveAttribute('data-center', JSON.stringify([16.05, 120.34]));
  });

  it('renders a marker only for properties with coordinates', () => {
    renderMap({ properties: [propertyWithCoords, propertyWithoutCoords] });
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
    expect(screen.getByText('Dagupan Demo Boarding House')).toBeInTheDocument();
  });

  it('links the marker popup to the property detail page', () => {
    renderMap({ properties: [propertyWithCoords] });
    expect(screen.getByRole('link', { name: /view details/i })).toHaveAttribute('href', '/tenant/properties/p1');
  });

  it('respects a custom linkPrefix (e.g. the public /properties route on the landing page)', () => {
    renderMap({ properties: [propertyWithCoords], linkPrefix: '/properties' });
    expect(screen.getByRole('link', { name: /view details/i })).toHaveAttribute('href', '/properties/p1');
  });
});
