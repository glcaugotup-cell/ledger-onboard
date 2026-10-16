import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiClientError } from '../services/apiClient.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PropertyDetailContent from './PropertyDetailContent.jsx';
import PropertyApi from '../services/PropertyApi.js';
import ReservationApi from '../services/ReservationApi.js';
import { mockAuthValue, VERIFIED_STUDENT_FIELDS } from '../test/mockContexts.js';
import { todayInputValue } from '../utils/validators.js';

const { useAuthMock, navigateMock } = vi.hoisted(() => ({ useAuthMock: vi.fn(), navigateMock: vi.fn() }));
vi.mock('../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../services/PropertyApi.js', () => ({ default: { getPublicDetail: vi.fn() } }));
vi.mock('../services/ReservationApi.js', () => ({ default: { create: vi.fn(), list: vi.fn(), cancel: vi.fn() } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div />,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
}));
vi.mock('leaflet', () => ({ default: { Icon: class MockIcon {} } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const detail = {
  property: {
    _id: 'p1',
    propertyName: 'Dagupan Demo Boarding House',
    propertyType: 'Bedspace',
    tenantGenderPolicy: 'Co-Ed',
    address: { street: '123 Main St', barangay: 'Bonuan', city: 'Dagupan', province: 'Pangasinan' },
    description: 'A cozy boarding house near the university.',
    amenities: ['WiFi'],
    houseRules: ['No smoking'],
    images: [],
    locationCoordinates: { lat: 16.05, lng: 120.34 },
  },
  rooms: [{ _id: 'r1', roomNumber: '101', status: 'available', monthlyBaseRent: 2500, currentOccupancy: 1, capacity: 2 }],
  reviews: [{ _id: 'rev1', rating: 5, comment: 'Great place!', tenantId: { fullName: 'Juan Dela Cruz' }, isVerifiedFormerTenant: true }],
};

function renderContent() {
  return render(
    <MemoryRouter initialEntries={['/tenant/properties/p1']}>
      <Routes>
        <Route path="/tenant/properties/:id" element={<PropertyDetailContent />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PropertyDetailContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Signed-in tenants also load their own requests (R6: "Reservation sent" instead of "Reserve").
    ReservationApi.list.mockResolvedValue({ reservations: [] });
  });

  it('shows a video tour player when the listing has a video', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: null, status: 'unauthenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue({ ...detail, property: { ...detail.property, videoUrl: '/uploads/properties/tour.mp4' } });
    renderContent();

    expect(await screen.findByRole('heading', { name: /video tour/i })).toBeInTheDocument();
    const video = screen.getByLabelText(/video tour of dagupan demo boarding house/i);
    expect(video.tagName).toBe('VIDEO');
    expect(video).toHaveAttribute('src', '/uploads/properties/tour.mp4');
    expect(video).toHaveAttribute('controls');
  });

  it('shows no video section when the listing has no video', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: null, status: 'unauthenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue(detail);
    renderContent();

    await screen.findByRole('heading', { name: 'Dagupan Demo Boarding House' });
    expect(screen.queryByRole('heading', { name: /video tour/i })).not.toBeInTheDocument();
  });

  it('shows an error message when the property cannot be found', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: null, status: 'unauthenticated' }));
    PropertyApi.getPublicDetail.mockRejectedValue(new Error('not found'));
    renderContent();
    expect(await screen.findByRole('alert')).toHaveTextContent('This property could not be found.');
  });

  it('renders property details, rooms, and reviews', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: null, status: 'unauthenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue(detail);
    renderContent();

    expect(await screen.findByRole('heading', { name: 'Dagupan Demo Boarding House' })).toBeInTheDocument();
    expect(screen.getByText('123 Main St, Bonuan, Dagupan, Pangasinan')).toBeInTheDocument();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('Verified Former Tenant')).toBeInTheDocument();
  });

  it('shows "Login to Reserve" for an anonymous visitor and sends them straight to the landing page (not /login, not this property, not the dashboard)', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: null, status: 'unauthenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue(detail);
    const user = userEvent.setup();
    renderContent();

    expect(await screen.findByRole('button', { name: /login to reserve/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^reserve this room$/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /login to reserve/i }));

    expect(navigateMock).toHaveBeenCalledWith('/');
    expect(screen.queryByLabelText(/preferred move-in date/i)).not.toBeInTheDocument();
    expect(ReservationApi.create).not.toHaveBeenCalled();
  });

  it('submits a reservation request for a signed-in tenant', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant', ...VERIFIED_STUDENT_FIELDS }, status: 'authenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue(detail);
    ReservationApi.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderContent();

    const nextMonth = todayInputValue(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
    await user.click(await screen.findByRole('button', { name: /reserve this room/i }));
    await user.type(screen.getByLabelText(/preferred move-in date/i), nextMonth);
    await user.click(screen.getByRole('button', { name: /submit request/i }));

    await waitFor(() => {
      expect(ReservationApi.create).toHaveBeenCalledWith({ roomId: 'r1', moveInDate: nextMonth });
    });
    expect(await screen.findByText(/reservation request submitted/i)).toBeInTheDocument();
  });

  it('R6: shows "Reservation sent" with a Cancel button instead of Reserve when the tenant already requested the room', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant', ...VERIFIED_STUDENT_FIELDS }, status: 'authenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue(detail);
    ReservationApi.list.mockResolvedValue({ reservations: [{ _id: 'res1', status: 'pending', roomId: { _id: 'r1' } }] });
    ReservationApi.cancel.mockResolvedValue({});
    const user = userEvent.setup();
    renderContent();

    expect(await screen.findByRole('button', { name: 'Reservation sent' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /reserve this room/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/already have an active reservation/i)).not.toBeInTheDocument();

    ReservationApi.list.mockResolvedValue({ reservations: [] });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel reservation' }));
    await waitFor(() => expect(ReservationApi.cancel).toHaveBeenCalledWith('res1'));
    expect(await screen.findByRole('button', { name: /reserve this room/i })).toBeInTheDocument();
  });

  it('summarizes the starting rent and how many rooms are open near the title', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: null, status: 'unauthenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue({
      ...detail,
      rooms: [...detail.rooms, { _id: 'r2', roomNumber: '102', status: 'occupied', monthlyBaseRent: 1800, currentOccupancy: 2, capacity: 2 }],
    });
    renderContent();
    expect(await screen.findByText('From ₱1,800')).toBeInTheDocument();
    expect(screen.getByText('1 of 2 rooms open')).toBeInTheDocument();
  });

  it('disables past days in the picker and rejects a typed past date', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant', ...VERIFIED_STUDENT_FIELDS }, status: 'authenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue(detail);
    const user = userEvent.setup();
    renderContent();

    await user.click(await screen.findByRole('button', { name: /reserve this room/i }));
    const input = screen.getByLabelText(/preferred move-in date/i);
    expect(input).toHaveAttribute('min', todayInputValue());

    const yesterday = todayInputValue(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await user.type(input, yesterday);
    expect(screen.getByText('Move-in date cannot be in the past.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /submit request/i }));
    expect(ReservationApi.create).not.toHaveBeenCalled();
  });

  it('accepts today', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant', ...VERIFIED_STUDENT_FIELDS }, status: 'authenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue(detail);
    ReservationApi.create.mockResolvedValue({});
    const user = userEvent.setup();
    renderContent();

    await user.click(await screen.findByRole('button', { name: /reserve this room/i }));
    await user.type(screen.getByLabelText(/preferred move-in date/i), todayInputValue());
    await user.click(screen.getByRole('button', { name: /submit request/i }));
    await waitFor(() => expect(ReservationApi.create).toHaveBeenCalledWith({ roomId: 'r1', moveInDate: todayInputValue() }));
  });

  it('shows the server’s move-in date error next to the field', async () => {
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant', ...VERIFIED_STUDENT_FIELDS }, status: 'authenticated' }));
    PropertyApi.getPublicDetail.mockResolvedValue(detail);
    ReservationApi.create.mockRejectedValue(
      Object.assign(new Error('Validation failed'), { code: 'VALIDATION_ERROR', details: [{ field: 'moveInDate', message: 'Move-in date cannot be in the past.' }] })
    );
    const user = userEvent.setup();
    renderContent();

    await user.click(await screen.findByRole('button', { name: /reserve this room/i }));
    await user.type(screen.getByLabelText(/preferred move-in date/i), todayInputValue());
    await user.click(screen.getByRole('button', { name: /submit request/i }));
    expect(await screen.findByText('Move-in date cannot be in the past.')).toBeInTheDocument();
  });
  // User rule (2026-10-16): only students with a current, admin-approved school ID can reserve.
  describe('students without a verified school ID', () => {
    const THIS_YEAR = new Date().getFullYear();

    it('see why and a link to verify instead of Reserve, and the profile is refreshed in case an admin just approved', async () => {
      const refreshProfile = vi.fn().mockResolvedValue(undefined);
      useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant' }, status: 'authenticated', refreshProfile }));
      PropertyApi.getPublicDetail.mockResolvedValue(detail);
      renderContent();

      expect(await screen.findByText('Verify your student ID before reserving a room.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Verify student ID to reserve' })).toHaveAttribute('href', '/tenant/verification');
      expect(screen.getByRole('link', { name: 'Go to Student ID' })).toHaveAttribute('href', '/tenant/verification');
      expect(screen.queryByRole('button', { name: /reserve this room/i })).not.toBeInTheDocument();
      expect(refreshProfile).toHaveBeenCalled();
    });

    it('while the ID is under review, see a disabled button and no link', async () => {
      useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant', studentVerificationStatus: 'PENDING' }, status: 'authenticated' }));
      PropertyApi.getPublicDetail.mockResolvedValue(detail);
      renderContent();

      expect(await screen.findByRole('button', { name: 'Student ID under review' })).toBeDisabled();
      expect(screen.getByText('Your student ID is still being reviewed. You can reserve once an admin approves it.')).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /verify student id/i })).not.toBeInTheDocument();
    });

    it('with an expired ID, are told until when it was valid', async () => {
      useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant', ...VERIFIED_STUDENT_FIELDS, studentIdValidUntilYear: THIS_YEAR - 1 }, status: 'authenticated' }));
      PropertyApi.getPublicDetail.mockResolvedValue(detail);
      renderContent();

      expect(await screen.findByText(`Your student ID was valid until May 31, ${THIS_YEAR - 1}. Upload your current school ID to reserve.`)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Verify student ID to reserve' })).toBeInTheDocument();
    });

    it("show the server's refusal and refresh the profile when the ID stopped counting after the page loaded", async () => {
      const refreshProfile = vi.fn().mockResolvedValue(undefined);
      useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 't1', role: 'tenant', ...VERIFIED_STUDENT_FIELDS }, status: 'authenticated', refreshProfile }));
      PropertyApi.getPublicDetail.mockResolvedValue(detail);
      ReservationApi.create.mockRejectedValue(new ApiClientError('Your student ID was not approved. Upload it again under Student verification to reserve.', 'STUDENT_NOT_VERIFIED', 403));
      const user = userEvent.setup();
      renderContent();
      expect(refreshProfile).not.toHaveBeenCalled(); // verified: nothing to refresh on load

      await user.click(await screen.findByRole('button', { name: /reserve this room/i }));
      await user.type(screen.getByLabelText(/preferred move-in date/i), todayInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
      await user.click(screen.getByRole('button', { name: /submit request/i }));

      expect(await screen.findByText('Your student ID was not approved. Upload it again under Student verification to reserve.')).toBeInTheDocument();
      expect(refreshProfile).toHaveBeenCalledTimes(1);
    });
  });
});
