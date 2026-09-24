import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DiscoverContent from './DiscoverContent.jsx';
import PropertyApi from '../services/PropertyApi.js';

const { mapStub } = vi.hoisted(() => ({
  mapStub: { setView: vi.fn(), fitBounds: vi.fn(), flyTo: vi.fn(), getZoom: vi.fn(() => 13) },
}));
vi.mock('../services/PropertyApi.js', () => ({ default: { search: vi.fn() } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div />,
  Marker: ({ children }) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
  useMap: () => mapStub,
}));
vi.mock('leaflet', () => ({ default: { Icon: class MockIcon {} } }));

const properties = [
  {
    _id: 'p1',
    propertyName: 'Dagupan Demo Boarding House',
    propertyType: 'Bedspace',
    tenantGenderPolicy: 'Co-Ed',
    address: { barangay: 'Bonuan', city: 'Dagupan' },
    locationCoordinates: { lat: 16.05, lng: 120.34 },
    images: [],
  },
];

function renderContent(props) {
  return render(
    <MemoryRouter>
      <DiscoverContent {...props} />
    </MemoryRouter>
  );
}

describe('DiscoverContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('searches on mount with no filters and renders results as cards', async () => {
    PropertyApi.search.mockResolvedValue({ properties });
    renderContent();

    await waitFor(() => expect(PropertyApi.search).toHaveBeenCalledWith({}));
    expect(await screen.findByText('Dagupan Demo Boarding House')).toBeInTheDocument();
    expect(screen.getByText('1 property found')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    PropertyApi.search.mockResolvedValue({ properties: [] });
    renderContent();
    expect(await screen.findByText(/no properties match your filters/i)).toBeInTheDocument();
  });

  it('shows an error banner when the search fails', async () => {
    PropertyApi.search.mockRejectedValue(new Error('boom'));
    renderContent();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load properties. Please try again.');
  });

  it('debounces filter changes into a single re-search with only non-empty params', async () => {
    PropertyApi.search.mockResolvedValue({ properties });
    const user = userEvent.setup();
    renderContent();
    await waitFor(() => expect(PropertyApi.search).toHaveBeenCalledTimes(1));

    await user.type(screen.getByLabelText('Search'), 'boarding');

    await waitFor(() => {
      expect(PropertyApi.search).toHaveBeenLastCalledWith({ text: 'boarding' });
    });
  });

  it('switches to the map view and renders a marker per result', async () => {
    PropertyApi.search.mockResolvedValue({ properties });
    const user = userEvent.setup();
    renderContent();
    await screen.findByText('Dagupan Demo Boarding House');

    await user.click(screen.getByRole('button', { name: 'Map' }));

    expect(screen.getByTestId('map-container')).toBeInTheDocument();
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
  });

  it('uses the given linkPrefix for property card links', async () => {
    PropertyApi.search.mockResolvedValue({ properties });
    renderContent({ linkPrefix: '/properties' });
    await screen.findByText('Dagupan Demo Boarding House');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/properties/p1');
  });

  it('without mapSection (landing page) keeps the Grid/Map toggle and no permanent map', async () => {
    PropertyApi.search.mockResolvedValue({ properties });
    renderContent({ linkPrefix: '/properties' });
    await screen.findByText('Dagupan Demo Boarding House');
    expect(screen.getByRole('button', { name: 'Grid' })).toBeInTheDocument();
    expect(screen.queryByTestId('map-container')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /show on map/i })).not.toBeInTheDocument();
  });
});

const twoProperties = [
  ...properties,
  {
    _id: 'p2',
    propertyName: 'Sunshine Boarding House',
    propertyType: 'Room Only',
    tenantGenderPolicy: 'Male Only',
    address: { barangay: 'Barangay I', city: 'Dagupan City' },
    locationCoordinates: { lat: 16.044, lng: 120.3364 },
    images: [],
    startingRent: 500,
  },
];

describe('DiscoverContent — tenant mapSection layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the grid AND one permanent map with a marker per result, and no Grid/Map toggle', async () => {
    PropertyApi.search.mockResolvedValue({ properties: twoProperties });
    renderContent({ mapSection: true });
    await screen.findByText('2 properties found');

    expect(screen.getAllByRole('button', { name: /show on map/i })).toHaveLength(2);
    expect(screen.getAllByTestId('map-container')).toHaveLength(1);
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Find boarding houses on the map' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grid' })).not.toBeInTheDocument();
    expect(mapStub.fitBounds).toHaveBeenCalledWith(
      [
        [16.05, 120.34],
        [16.044, 120.3364],
      ],
      expect.any(Object)
    );
  });

  it('filters update both the cards and the markers from the same result set', async () => {
    PropertyApi.search.mockResolvedValueOnce({ properties: twoProperties }).mockResolvedValue({ properties: [twoProperties[1]] });
    const user = userEvent.setup();
    renderContent({ mapSection: true });
    await screen.findByText('2 properties found');

    await user.selectOptions(screen.getByLabelText('Barangay'), 'Barangay I');

    await waitFor(() => expect(PropertyApi.search).toHaveBeenLastCalledWith({ barangay: 'Barangay I' }));
    await screen.findByText('1 property found');
    expect(screen.getAllByTestId('marker')).toHaveLength(1);
    expect(screen.queryByText('Dagupan Demo Boarding House')).not.toBeInTheDocument();
    expect(mapStub.setView).toHaveBeenLastCalledWith([16.044, 120.3364], 16); // single result → centered on it
  });

  it('keeps the single map mounted with a clean empty-state message when nothing matches', async () => {
    PropertyApi.search.mockResolvedValue({ properties: [] });
    renderContent({ mapSection: true });
    expect(await screen.findByText('No boarding houses match your current filters.')).toBeInTheDocument();
    expect(screen.getAllByTestId('map-container')).toHaveLength(1);
    expect(screen.queryAllByTestId('marker')).toHaveLength(0);
  });

  it('popups use the real property data, including the starting rent, and link to the existing detail page', async () => {
    PropertyApi.search.mockResolvedValue({ properties: twoProperties });
    renderContent({ mapSection: true });
    await screen.findByText('2 properties found');
    expect(screen.getByText('From ₱500 / month')).toBeInTheDocument();
    const detailLinks = screen.getAllByRole('link', { name: /view details/i }).map((a) => a.getAttribute('href'));
    expect(detailLinks).toEqual(['/tenant/properties/p1', '/tenant/properties/p2']);
  });

  it('"Show on map" on a card scrolls to the map and flies to that property', async () => {
    PropertyApi.search.mockResolvedValue({ properties: twoProperties });
    const user = userEvent.setup();
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    renderContent({ mapSection: true });
    await screen.findByText('2 properties found');

    await user.click(screen.getAllByRole('button', { name: /show on map/i })[1]);
    expect(mapStub.flyTo).toHaveBeenCalledWith([16.044, 120.3364], 16, expect.any(Object));
    expect(scrollSpy).toHaveBeenCalled();
  });
});
