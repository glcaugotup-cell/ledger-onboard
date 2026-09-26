import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PropertyCard from './PropertyCard.jsx';

const property = {
  _id: 'p1',
  propertyName: 'Dagupan Demo Boarding House',
  propertyType: 'Bedspace',
  tenantGenderPolicy: 'Co-Ed',
  address: { barangay: 'Bonuan', city: 'Dagupan' },
  images: ['https://example.com/photo.jpg'],
};

describe('PropertyCard', () => {
  it('links to the property detail page under the given prefix', () => {
    render(
      <MemoryRouter>
        <PropertyCard property={property} linkPrefix="/tenant/properties" />
      </MemoryRouter>
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tenant/properties/p1');
  });

  it('renders the property name, type, and location', () => {
    render(
      <MemoryRouter>
        <PropertyCard property={property} />
      </MemoryRouter>
    );
    expect(screen.getByText('Dagupan Demo Boarding House')).toBeInTheDocument();
    expect(screen.getByText('Bedspace')).toBeInTheDocument();
    expect(screen.getByText('Bonuan, Dagupan')).toBeInTheDocument();
  });

  it('shows a placeholder when the property has no images', () => {
    render(
      <MemoryRouter>
        <PropertyCard property={{ ...property, images: [] }} />
      </MemoryRouter>
    );
    expect(screen.getByText('No photo yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('defaults the link prefix to /tenant/properties', () => {
    render(
      <MemoryRouter>
        <PropertyCard property={property} />
      </MemoryRouter>
    );
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tenant/properties/p1');
  });
  it('shows the starting monthly rent, or says there are no rooms yet', () => {
    const { rerender } = render(
      <MemoryRouter>
        <PropertyCard property={{ ...property, startingRent: 2500 }} />
      </MemoryRouter>
    );
    expect(screen.getByText('₱2,500')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <PropertyCard property={{ ...property, startingRent: null }} />
      </MemoryRouter>
    );
    expect(screen.getByText('No rooms listed yet')).toBeInTheDocument();
  });
});
