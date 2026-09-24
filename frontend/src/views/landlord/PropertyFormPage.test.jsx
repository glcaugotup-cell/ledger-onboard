import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PropertyFormPage from './PropertyFormPage.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import { ApiClientError } from '../../services/apiClient.js';
import { mockAuthValue, mockNotificationsValue } from '../../test/mockContexts.js';

const { useAuthMock, useNotificationsMock, navigateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useNotificationsMock: vi.fn(),
  navigateMock: vi.fn(),
}));
vi.mock('../../context/AuthContext.jsx', () => ({ useAuth: useAuthMock }));
vi.mock('../../context/NotificationContext.jsx', () => ({ useNotifications: useNotificationsMock }));
vi.mock('../../services/PropertyApi.js', () => ({ default: { create: vi.fn() } }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div>{children}</div>,
  TileLayer: () => <div />,
  Marker: ({ children }) => <div>{children}</div>,
  Popup: ({ children }) => <div>{children}</div>,
}));
vi.mock('leaflet', () => ({ default: { Icon: class MockIcon {} } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <PropertyFormPage />
    </MemoryRouter>
  );
}

/** Fills the minimum required fields, including picking a real barangay from the searchable dropdown (never free-typed as an exact location) and an actual Property type/Gender policy (neither defaults to a real value anymore). */
async function fillRequiredFields(
  user,
  { propertyName = 'Dagupan Demo Boarding House', street = '123 Main St', barangay = 'Poblacion Oeste', propertyType = 'Bedspace', genderPolicy = 'Co-Ed' } = {}
) {
  await user.type(screen.getByLabelText('Property name'), propertyName);
  await user.type(screen.getByLabelText('Street'), street);
  await user.type(screen.getByLabelText('Barangay'), barangay);
  await user.click(await screen.findByRole('button', { name: barangay }));
  await user.selectOptions(screen.getByLabelText('Property type'), propertyType);
  await user.selectOptions(screen.getByLabelText('Gender policy'), genderPolicy);
}

// This file's tests type longer strings and upload multiple files, making
// them noticeably heavier than average — under the full suite's parallel
// worker load that's occasionally enough to blow past vitest's default
// 5000ms per-test timeout (observed as a timeout or, worse, garbled
// interleaved keystrokes from a starved event loop), even though every
// test here passes reliably when this file runs alone. Give the whole
// file more headroom rather than leave that flaky.
vi.setConfig({ testTimeout: 15000 });

describe('PropertyFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue(mockAuthValue({ user: { _id: 'l1', fullName: 'Landlord Cruz', role: 'landlord' } }));
    useNotificationsMock.mockReturnValue(mockNotificationsValue());
  });

  it('submits the form as multipart form data with nested address/coordinate fields sourced from the selected barangay', async () => {
    PropertyApi.create.mockResolvedValue({ property: { _id: 'p1' } });
    const user = userEvent.setup();
    renderPage();

    await fillRequiredFields(user);
    await user.type(screen.getByPlaceholderText('e.g., WiFi, Aircon, CCTV, Parking'), 'WiFi{enter}Aircon{enter}');

    await user.click(screen.getByRole('button', { name: /create listing/i }));

    await waitFor(() => {
      expect(PropertyApi.create).toHaveBeenCalledTimes(1);
    });
    const [formData] = PropertyApi.create.mock.calls[0];
    expect(formData.get('propertyName')).toBe('Dagupan Demo Boarding House');
    expect(formData.get('address[street]')).toBe('123 Main St');
    expect(formData.get('address[barangay]')).toBe('Poblacion Oeste');
    expect(formData.get('address[city]')).toBe('Dagupan City');
    expect(formData.get('address[province]')).toBe('Pangasinan');
    // Coordinates come from the barangay dataset, not any user-typed value.
    expect(formData.get('locationCoordinates[lat]')).toBe('16.0436');
    expect(formData.get('locationCoordinates[lng]')).toBe('120.3293');
    expect(formData.getAll('amenities[]')).toEqual(['WiFi', 'Aircon']);
  });

  it('title-cases the Street and Property name fields on blur, without fighting the user while typing', async () => {
    const user = userEvent.setup();
    renderPage();

    const propertyName = screen.getByLabelText('Property name');
    await user.type(propertyName, 'calaycay boarding house');
    expect(propertyName).toHaveValue('calaycay boarding house'); // untouched while typing
    await user.tab();
    expect(propertyName).toHaveValue('Calaycay Boarding House');

    const street = screen.getByLabelText('Street');
    await user.type(street, 'arellano street');
    await user.tab();
    expect(street).toHaveValue('Arellano Street');
  });

  it('shows a searchable barangay dropdown filtered by what was typed, and fills read-only lat/lng only after an exact selection', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByLabelText('Latitude')).toHaveAttribute('placeholder', 'Select a barangay first');
    expect(screen.getByLabelText('Longitude')).toHaveAttribute('placeholder', 'Select a barangay first');

    await user.type(screen.getByLabelText('Barangay'), 'bonuan');
    expect(await screen.findByRole('button', { name: 'Bonuan Gueset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bonuan Boquig' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Poblacion Oeste' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bonuan Gueset' }));

    expect(screen.getByLabelText('Latitude')).toHaveValue('16.0696');
    expect(screen.getByLabelText('Longitude')).toHaveValue('120.3339');
    expect(screen.getByLabelText('Latitude')).toHaveAttribute('readonly');
    expect(screen.getByText(/location coordinates automatically filled/i)).toBeInTheDocument();
  });

  it('clears the auto-filled coordinates if the barangay text is edited away from the exact selection', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Barangay'), 'Lucao');
    await user.click(await screen.findByRole('button', { name: 'Lucao' }));
    expect(screen.getByLabelText('Latitude')).toHaveValue('16.0141');

    await user.type(screen.getByLabelText('Barangay'), 'x');
    expect(screen.getByLabelText('Latitude')).toHaveValue('');
    expect(screen.getByLabelText('Latitude')).toHaveAttribute('placeholder', 'Select a barangay first');
  });

  it('blocks submission and shows a validation error when no exact barangay has been selected', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Property name'), 'Dagupan Demo Boarding House');
    await user.type(screen.getByLabelText('Street'), '123 Main St');
    // Typed but never selected from the dropdown.
    await user.type(screen.getByLabelText('Barangay'), 'Poblacion Oeste');
    await user.selectOptions(screen.getByLabelText('Property type'), 'Bedspace');
    await user.selectOptions(screen.getByLabelText('Gender policy'), 'Co-Ed');
    await user.click(screen.getByRole('button', { name: /create listing/i }));

    expect(await screen.findByText('Select the exact barangay from the list.')).toBeInTheDocument();
    expect(PropertyApi.create).not.toHaveBeenCalled();
  });

  it('Property type and Gender policy initially show a "Choose…" placeholder that is not a real selection', () => {
    renderPage();

    expect(screen.getByLabelText('Property type')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Choose property type' })).toBeDisabled();
    expect(screen.getByLabelText('Gender policy')).toHaveValue('');
    expect(screen.getByRole('option', { name: 'Choose gender policy' })).toBeDisabled();

    // The real choices are still all present, unchanged.
    ['Room Only', 'Apartment', 'Bedspace', 'Studio'].forEach((t) => expect(screen.getByRole('option', { name: t })).toBeInTheDocument());
    ['Female Only', 'Male Only', 'Co-Ed'].forEach((g) => expect(screen.getByRole('option', { name: g })).toBeInTheDocument());
  });

  it('blocks submission until Property type and Gender policy are explicitly chosen', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText('Property name'), 'Dagupan Demo Boarding House');
    await user.type(screen.getByLabelText('Street'), '123 Main St');
    await user.type(screen.getByLabelText('Barangay'), 'Poblacion Oeste');
    await user.click(await screen.findByRole('button', { name: 'Poblacion Oeste' }));
    await user.click(screen.getByRole('button', { name: /create listing/i }));

    expect(await screen.findByText('Choose a property type.')).toBeInTheDocument();
    expect(screen.getByText('Choose a gender policy.')).toBeInTheDocument();
    expect(PropertyApi.create).not.toHaveBeenCalled();

    // The error text is now part of the same <label>'s accessible name, so
    // an exact-string match would no longer resolve — same gotcha as any
    // other Field with extra label text (see the House rules/hint case).
    await user.selectOptions(screen.getByLabelText(/^property type/i), 'Bedspace');
    await user.selectOptions(screen.getByLabelText(/^gender policy/i), 'Co-Ed');
    PropertyApi.create.mockResolvedValue({ property: { _id: 'p1' } });
    await user.click(screen.getByRole('button', { name: /create listing/i }));

    await waitFor(() => {
      expect(PropertyApi.create).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an explicit success message confirming immediate publication (no admin review) with a "View listing" action instead of silently redirecting', async () => {
    PropertyApi.create.mockResolvedValue({ property: { _id: 'p1' } });
    const user = userEvent.setup();
    renderPage();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /create listing/i }));

    expect(await screen.findByText('Property listing published successfully.')).toBeInTheDocument();
    expect(screen.getByText(/already live and visible to tenants — no additional admin approval is needed/i)).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /view listing/i }));
    expect(navigateMock).toHaveBeenCalledWith('/landlord/properties/p1');
  });

  it('shows a field-level error returned by the server', async () => {
    PropertyApi.create.mockRejectedValue(
      new ApiClientError('Validation failed', 'VALIDATION_ERROR', 422, [{ field: 'propertyName', message: 'Name already in use' }])
    );
    const user = userEvent.setup();
    renderPage();

    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /create listing/i }));

    expect(await screen.findByText('Validation failed')).toBeInTheDocument();
    expect(await screen.findByText('Name already in use')).toBeInTheDocument();
  });

  it('adds and removes amenity tags without altering their casing (e.g. "WiFi" stays "WiFi", not "Wifi")', async () => {
    const user = userEvent.setup();
    renderPage();

    const amenityInput = screen.getByPlaceholderText('e.g., WiFi, Aircon, CCTV, Parking');
    await user.type(amenityInput, 'WiFi{enter}');
    expect(screen.getByText('WiFi')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove wifi/i }));
    expect(screen.queryByText('WiFi')).not.toBeInTheDocument();
  });

  it('title-cases a Nearby University tag on add, but never touches Amenity casing', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText('e.g., PHINMA University of Pangasinan, University of Luzon'), 'urdaneta city university{enter}');
    expect(screen.getByText('Urdaneta City University')).toBeInTheDocument();
  });

  it('sentence-cases House Rules on blur without title-casing every word', async () => {
    const user = userEvent.setup();
    renderPage();

    const houseRules = screen.getByLabelText(/^house rules/i);
    await user.type(houseRules, 'no visitors after 10pm');
    await user.tab();
    expect(houseRules).toHaveValue('No visitors after 10pm');
  });

  function makeImageFile(name = 'photo.png') {
    return new File(['fake-image-bytes'], name, { type: 'image/png' });
  }

  it('shows a thumbnail preview with a remove button for each selected photo, up to 5', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByLabelText('Upload property photos');
    const files = [1, 2, 3, 4, 5].map((n) => makeImageFile(`photo${n}.png`));
    await user.upload(input, files);

    expect(screen.getAllByRole('img', { name: /^property photo/i })).toHaveLength(5);
    expect(screen.getByRole('button', { name: /remove photo 1/i })).toBeInTheDocument();
    // The max is reached — the "+ Add Photos" dropzone is no longer offered.
    expect(screen.queryByText(/\+ add photos/i)).not.toBeInTheDocument();
  });

  it('caps at 5 photos and shows "You can upload a maximum of 5 photos." when more are selected at once', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = screen.getByLabelText('Upload property photos');
    const files = [1, 2, 3, 4, 5, 6].map((n) => makeImageFile(`photo${n}.png`));
    await user.upload(input, files);

    expect(screen.getAllByRole('img', { name: /^property photo/i })).toHaveLength(5);
    expect(screen.getByText('You can upload a maximum of 5 photos.')).toBeInTheDocument();
  });

  it('removes a photo and allows adding another one afterward', async () => {
    const user = userEvent.setup();
    renderPage();

    let input = screen.getByLabelText('Upload property photos');
    await user.upload(input, [makeImageFile('a.png'), makeImageFile('b.png')]);
    expect(screen.getAllByRole('img', { name: /^property photo/i })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: /remove photo 1/i }));
    expect(screen.getAllByRole('img', { name: /^property photo/i })).toHaveLength(1);

    input = screen.getByLabelText('Upload property photos');
    await user.upload(input, [makeImageFile('c.png')]);
    expect(screen.getAllByRole('img', { name: /^property photo/i })).toHaveLength(2);
  });

  it('includes selected photos in the submitted FormData, up to the max of 5', async () => {
    PropertyApi.create.mockResolvedValue({ property: { _id: 'p1' } });
    const user = userEvent.setup();
    renderPage();

    await fillRequiredFields(user);
    const input = screen.getByLabelText('Upload property photos');
    await user.upload(input, [makeImageFile('a.png'), makeImageFile('b.png')]);

    await user.click(screen.getByRole('button', { name: /create listing/i }));

    await waitFor(() => expect(PropertyApi.create).toHaveBeenCalledTimes(1));
    const [formData] = PropertyApi.create.mock.calls[0];
    expect(formData.getAll('images').map((f) => f.name)).toEqual(['a.png', 'b.png']);
  });

  it('rejects a non-video file chosen for the optional Property Video', async () => {
    // user-event normally mirrors the OS file-picker's own accept-attribute
    // filtering and would silently refuse this file before it ever reaches
    // onVideoSelected — applyAccept: false (a userEvent.setup() config, not
    // a per-upload option) simulates the one real path that does bypass it
    // (drag-and-drop), which the component's own type check still guards.
    const user = userEvent.setup({ applyAccept: false });
    renderPage();

    const videoInput = screen.getByLabelText('Upload property video');
    const badFile = new File(['not a video'], 'notes.txt', { type: 'text/plain' });
    await user.upload(videoInput, badFile);

    expect(screen.getByText('Please choose an MP4, WEBM, or MOV video.')).toBeInTheDocument();
    expect(screen.queryByText(/selected video:/i)).not.toBeInTheDocument();
  });

  it('previews a selected video, allows removing it, and a listing can still be created without one', async () => {
    PropertyApi.create.mockResolvedValue({ property: { _id: 'p1' } });
    const user = userEvent.setup();
    renderPage();

    const videoInput = screen.getByLabelText('Upload property video');
    const videoFile = new File(['fake-mp4-bytes'], 'tour.mp4', { type: 'video/mp4' });
    await user.upload(videoInput, videoFile);

    expect(screen.getByText('Selected video: tour.mp4')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove video/i }));
    expect(screen.queryByText(/selected video:/i)).not.toBeInTheDocument();

    // A listing can still be created with no video at all — it's optional.
    await fillRequiredFields(user);
    await user.click(screen.getByRole('button', { name: /create listing/i }));

    await waitFor(() => expect(PropertyApi.create).toHaveBeenCalledTimes(1));
    const [formData] = PropertyApi.create.mock.calls[0];
    expect(formData.has('video')).toBe(false);
  });

  it('includes the video in the submitted FormData when one is selected', async () => {
    PropertyApi.create.mockResolvedValue({ property: { _id: 'p1' } });
    const user = userEvent.setup();
    renderPage();

    await fillRequiredFields(user);
    const videoInput = screen.getByLabelText('Upload property video');
    const videoFile = new File(['fake-mp4-bytes'], 'tour.mp4', { type: 'video/mp4' });
    await user.upload(videoInput, videoFile);

    await user.click(screen.getByRole('button', { name: /create listing/i }));

    await waitFor(() => expect(PropertyApi.create).toHaveBeenCalledTimes(1));
    const [formData] = PropertyApi.create.mock.calls[0];
    expect(formData.get('video').name).toBe('tour.mp4');
  });
});
