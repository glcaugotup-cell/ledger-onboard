import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PropertiesPage from './PropertiesPage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), useNotificationsMock: vi.fn() }));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/PropertyApi.js', () => ({ default: { listMine: vi.fn() } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <PropertiesPage />
    </MemoryRouter>
  );
}

describe('PropertiesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(
      mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord', businessVerificationStatus: 'VERIFIED' } })
    );
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('shows an empty state with no properties', async () => {
    PropertyApi.listMine.mockResolvedValue({ properties: [] });
    renderPage();
    expect(await screen.findByText(/no properties yet/i)).toBeInTheDocument();
  });

  it('lists properties with their listing status and links to management', async () => {
    PropertyApi.listMine.mockResolvedValue({
      properties: [
        { _id: 'p1', propertyName: 'Dagupan Demo Boarding House', listingStatus: 'approved', address: { barangay: 'Bonuan', city: 'Dagupan' } },
      ],
    });
    renderPage();

    expect(await screen.findByText('Dagupan Demo Boarding House')).toBeInTheDocument();
    expect(screen.getByText('approved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dagupan Demo Boarding House/i })).toHaveAttribute('href', '/landlord/properties/p1');
  });

  it('links the "+ New property" button to the creation form', async () => {
    PropertyApi.listMine.mockResolvedValue({ properties: [] });
    renderPage();
    await screen.findByText(/no properties yet/i);
    expect(screen.getByRole('link', { name: /new property/i })).toHaveAttribute('href', '/landlord/properties/new');
  });

  it('gates "+ New property" behind business verification for an unverified landlord', async () => {
    useAuthMock.mockReturnValue(
      mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord', businessVerificationStatus: null } })
    );
    PropertyApi.listMine.mockResolvedValue({ properties: [] });
    renderPage();
    await screen.findByText(/no properties yet/i);

    expect(screen.queryByRole('link', { name: /^\+ new property$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /verify business to add a property/i })).toHaveAttribute('href', '/landlord/verification');
    expect(screen.getByText(/before you can create a new property listing/i)).toBeInTheDocument();
  });
});
