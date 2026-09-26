import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  HomeIcon,
  LightBulbIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  VideoCameraIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import DashboardLayout from '../../components/layout/DashboardLayout.jsx';
import PropertyApi from '../../services/PropertyApi.js';
import PropertyMap from '../../components/map/PropertyMap.jsx';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { Field, Select, TextArea, TextInput } from '../../components/ui/Field.jsx';
import { ErrorBanner } from '../../components/ui/Feedback.jsx';
import { describeApiError } from '../../utils/errors.js';
import { capitalizeFirst, toSentenceCase, toTitleCase } from '../../utils/textFormat.js';

// Free-text label fields get their first letter raised as the landlord types.
const LIVE_CAPITALIZED = new Set(['propertyName', 'street', 'description']);
import { DAGUPAN_BARANGAYS } from '../../data/dagupanBarangays.js';

const PROPERTY_TYPES = ['Room Only', 'Apartment', 'Bedspace', 'Studio'];
const GENDER_POLICIES = ['Female Only', 'Male Only', 'Co-Ed'];
const MAX_PHOTOS = 5;
const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

const initialForm = {
  propertyName: '',
  description: '',
  street: '',
  // No default: the landlord must choose one explicitly.
  propertyType: '',
  tenantGenderPolicy: '',
  houseRules: '',
};

/**
 * Chip/tag input for Nearby Universities and Amenities. `format` runs when a
 * tag is added; Amenities uses none so values like "WiFi" or "CCTV" keep their case.
 */
function TagInput({ label, hint, values, onAdd, onRemove, placeholder, format = (v) => v }) {
  const [text, setText] = useState('');

  function commit() {
    const cleaned = format(text.trim());
    if (cleaned && !values.includes(cleaned)) onAdd(cleaned);
    setText('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit();
    }
  }

  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white p-2 focus-within:ring-2 focus-within:ring-brand-400">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700">
            {v}
            <button type="button" onClick={() => onRemove(v)} className="text-brand-400 hover:text-brand-700" aria-label={`Remove ${v}`}>
              <XMarkIcon className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={values.length ? 'Add more…' : placeholder}
          className="min-w-[140px] flex-1 border-none bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
      </div>
    </Field>
  );
}

export default function PropertyFormPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [images, setImages] = useState([]);
  const [photoError, setPhotoError] = useState('');
  const [video, setVideo] = useState(null);
  const [videoError, setVideoError] = useState('');
  const [universities, setUniversities] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);

  const [barangayQuery, setBarangayQuery] = useState('');
  const [barangayOpen, setBarangayOpen] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState(null);

  const filteredBarangays = useMemo(() => {
    const q = barangayQuery.trim().toLowerCase();
    const list = q ? DAGUPAN_BARANGAYS.filter((b) => b.name.toLowerCase().includes(q)) : DAGUPAN_BARANGAYS;
    return list.slice(0, 8);
  }, [barangayQuery]);

  // Preview object URLs, revoked on cleanup to avoid leaking memory.
  const [imagePreviews, setImagePreviews] = useState([]);
  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setImagePreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  useEffect(() => {
    if (!video) {
      setVideoPreviewUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(video);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [video]);

  function onPhotosSelected(e) {
    const incoming = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-selecting the same file later
    if (incoming.length === 0) return;
    const combined = [...images, ...incoming];
    setPhotoError(combined.length > MAX_PHOTOS ? 'You can upload a maximum of 5 photos.' : '');
    setImages(combined.slice(0, MAX_PHOTOS));
  }

  function removePhoto(index) {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setPhotoError('');
  }

  function onVideoSelected(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!VIDEO_MIME_TYPES.includes(file.type)) {
      setVideoError('Please choose an MP4, WEBM, or MOV video.');
      return;
    }
    setVideoError('');
    setVideo(file);
  }

  function removeVideo() {
    setVideo(null);
    setVideoError('');
  }

  const update = (key) => (e) => {
    const value = LIVE_CAPITALIZED.has(key) ? capitalizeFirst(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  function onStreetBlur() {
    setForm((f) => ({ ...f, street: toTitleCase(f.street) }));
  }

  function onPropertyNameBlur() {
    setForm((f) => ({ ...f, propertyName: toTitleCase(f.propertyName) }));
  }

  function onHouseRulesBlur() {
    // Sentence-case each line; title-casing would mangle rules like "No visitors after 10pm".
    setForm((f) => ({
      ...f,
      houseRules: f.houseRules
        .split('\n')
        .map((line) => toSentenceCase(line))
        .join('\n'),
    }));
  }

  function onBarangayInputChange(e) {
    const value = e.target.value;
    setBarangayQuery(value);
    setBarangayOpen(true);
    // Editing the text clears the selection so stale coordinates are never kept.
    if (selectedBarangay && value !== selectedBarangay.name) setSelectedBarangay(null);
  }

  function selectBarangay(b) {
    setSelectedBarangay(b);
    setBarangayQuery(b.name);
    setBarangayOpen(false);
    setErrors((prev) => ({ ...prev, barangay: undefined }));
  }

  function validateAll() {
    const nextErrors = {};
    // Same limits as backend/validators/propertyValidators.js.
    const name = form.propertyName.trim();
    if (!name) nextErrors.propertyName = 'Property name is required.';
    else if (name.length < 2 || name.length > 120) nextErrors.propertyName = 'Property name must be 2-120 characters.';
    if (!form.street.trim()) nextErrors.street = 'Street is required.';
    else if (form.street.trim().length > 200) nextErrors.street = 'Street must be at most 200 characters.';
    if (form.description.length > 4000) nextErrors.description = 'Description must be at most 4000 characters.';
    if (!selectedBarangay) nextErrors.barangay = 'Select the exact barangay from the list.';
    if (!form.propertyType) nextErrors.propertyType = 'Choose a property type.';
    if (!form.tenantGenderPolicy) nextErrors.tenantGenderPolicy = 'Choose a gender policy.';
    return nextErrors;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const nextErrors = validateAll();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setLoading(true);
    try {
      const propertyName = toTitleCase(form.propertyName.trim());
      const street = toTitleCase(form.street.trim());

      const fd = new FormData();
      fd.append('propertyName', propertyName);
      fd.append('description', form.description);
      fd.append('address[street]', street);
      fd.append('address[barangay]', selectedBarangay.name);
      fd.append('address[city]', 'Dagupan City');
      fd.append('address[province]', 'Pangasinan');
      // Always taken from the selected barangay so it matches the backend's dataset.
      fd.append('locationCoordinates[lat]', String(selectedBarangay.lat));
      fd.append('locationCoordinates[lng]', String(selectedBarangay.lng));
      fd.append('propertyType', form.propertyType);
      fd.append('tenantGenderPolicy', form.tenantGenderPolicy);
      amenities.forEach((v) => fd.append('amenities[]', v));
      universities.forEach((v) => fd.append('nearbyUniversities[]', v));
      form.houseRules
        .split(/[\n,]/)
        .map((s) => toSentenceCase(s.trim()))
        .filter(Boolean)
        .forEach((v) => fd.append('houseRules[]', v));
      images.forEach((img) => fd.append('images', img));
      if (video) fd.append('video', video);

      const { property } = await PropertyApi.create(fd);
      setCreated(property);
    } catch (err) {
      const { message, fieldErrors } = describeApiError(err);
      setError(message);
      // The API names address fields "address.street"/"address.barangay"; this form calls them street/barangay.
      const mapped = { ...fieldErrors };
      if (fieldErrors['address.street']) mapped.street = fieldErrors['address.street'];
      if (fieldErrors['address.barangay']) mapped.barangay = fieldErrors['address.barangay'];
      setErrors((prev) => ({ ...prev, ...mapped }));
    } finally {
      setLoading(false);
    }
  };

  if (created) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-xl">
          <Card>
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
                <CheckCircleIcon className="h-8 w-8" />
              </span>
              <h1 className="text-xl font-bold text-gray-900">Property listing published successfully.</h1>
              <p className="max-w-sm text-sm text-gray-500">
                Your business is verified, so this listing is already live and visible to tenants — no additional admin approval is needed.
              </p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => navigate(`/landlord/properties/${created._id}`)}>View listing</Button>
                <Button variant="secondary" onClick={() => navigate('/landlord/properties')}>
                  Back to Properties
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl">
        <Link to="/landlord/properties" className="mb-4 flex w-fit items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-700">
          <ArrowLeftIcon className="h-4 w-4" /> Back to Properties
        </Link>

        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <HomeIcon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">New Property Listing</h1>
            <p className="mt-0.5 text-sm text-gray-500">Fill in the details below to add your boarding house to the platform.</p>
          </div>
        </div>

        <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* LEFT COLUMN — all form fields */}
          <div className="lg:col-span-2">
            <Card>
              <ErrorBanner message={error} />

              <div className="mb-5 flex items-center gap-2">
                <DocumentTextIcon className="h-5 w-5 text-brand-600" />
                <h2 className="text-base font-semibold text-gray-900">Property Information</h2>
              </div>

              <div className="space-y-4">
                <Field label="Property name" error={errors.propertyName}>
                  <TextInput
                    value={form.propertyName}
                    onChange={update('propertyName')}
                    onBlur={onPropertyNameBlur}
                    maxLength={120}
                    placeholder="e.g., Sunshine Boarding House"
                    error={errors.propertyName}
                  />
                </Field>
                <Field label="Description" error={errors.description}>
                  <TextArea
                    rows={3}
                    value={form.description}
                    onChange={update('description')}
                    maxLength={4000}
                    error={errors.description}
                    placeholder="e.g., Comfortable boarding house near the highway and universities."
                  />
                </Field>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Property type" error={errors.propertyType}>
                    <Select value={form.propertyType} onChange={update('propertyType')} error={errors.propertyType}>
                      <option value="" disabled>
                        Choose property type
                      </option>
                      {PROPERTY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Gender policy" error={errors.tenantGenderPolicy}>
                    <Select value={form.tenantGenderPolicy} onChange={update('tenantGenderPolicy')} error={errors.tenantGenderPolicy}>
                      <option value="" disabled>
                        Choose gender policy
                      </option>
                      {GENDER_POLICIES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <TagInput
                  label="Nearby universities"
                  values={universities}
                  onAdd={(v) => setUniversities((prev) => [...prev, v])}
                  onRemove={(v) => setUniversities((prev) => prev.filter((u) => u !== v))}
                  placeholder="e.g., PHINMA University of Pangasinan, University of Luzon"
                  format={toTitleCase}
                />

                <TagInput
                  label="Amenities"
                  values={amenities}
                  onAdd={(v) => setAmenities((prev) => [...prev, v])}
                  onRemove={(v) => setAmenities((prev) => prev.filter((a) => a !== v))}
                  placeholder="e.g., WiFi, Aircon, CCTV, Parking"
                />

                <Field label="House rules" hint="One per line, or comma-separated">
                  <TextArea
                    rows={3}
                    value={form.houseRules}
                    onChange={update('houseRules')}
                    onBlur={onHouseRulesBlur}
                    maxLength={500}
                    placeholder="e.g., No visitors after 10 PM, No smoking"
                  />
                </Field>
              </div>

              <hr className="my-6 border-gray-100" />

              <div className="mb-5 flex items-center gap-2">
                <MapPinIcon className="h-5 w-5 text-brand-600" />
                <h2 className="text-base font-semibold text-gray-900">Location</h2>
              </div>

              <div className="space-y-4">
                <Field label="Street" error={errors.street}>
                  <div className="relative">
                    <TextInput
                      value={form.street}
                      onChange={update('street')}
                      onBlur={onStreetBlur}
                      placeholder="e.g., Arellano Street"
                      error={errors.street}
                      className={form.street ? 'pr-9' : ''}
                    />
                    {form.street && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, street: '' }))}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                        aria-label="Clear street"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </Field>

                <div
                  className="relative"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setBarangayOpen(false);
                  }}
                >
                  <Field label="Barangay" error={errors.barangay}>
                    <div className="relative">
                      <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <TextInput
                        value={barangayQuery}
                        onChange={onBarangayInputChange}
                        onFocus={() => setBarangayOpen(true)}
                        placeholder="Search or select a barangay"
                        error={errors.barangay}
                        className="pl-9"
                      />
                    </div>
                  </Field>

                  {barangayOpen && (
                    <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                      {filteredBarangays.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No barangay matches your search.</p>}
                      {filteredBarangays.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => selectBarangay(b)}
                          className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-brand-50"
                        >
                          {b.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedBarangay ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                    <CheckCircleIcon className="h-4 w-4" /> Location coordinates automatically filled.
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">Select the exact barangay to automatically fill the location coordinates.</p>
                )}

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Latitude">
                    <TextInput
                      value={selectedBarangay ? selectedBarangay.lat : ''}
                      readOnly
                      disabled
                      placeholder="Select a barangay first"
                      className="cursor-not-allowed bg-gray-50 text-gray-500"
                    />
                  </Field>
                  <Field label="Longitude">
                    <TextInput
                      value={selectedBarangay ? selectedBarangay.lng : ''}
                      readOnly
                      disabled
                      placeholder="Select a barangay first"
                      className="cursor-not-allowed bg-gray-50 text-gray-500"
                    />
                  </Field>
                </div>

                <Field label="Property Photos" hint="Add clear photos of the exterior, rooms, bathroom, kitchen, and common areas.">
                  <p className="mb-2 text-xs text-gray-500">Upload up to 5 photos of your property.</p>

                  {images.length < MAX_PHOTOS && (
                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 px-4 py-8 text-center hover:border-brand-300">
                      <ArrowUpTrayIcon className="h-6 w-6 text-brand-500" />
                      <span className="text-sm text-gray-600">
                        <span className="font-semibold text-brand-700">+ Add Photos</span> or drag and drop
                      </span>
                      <span className="text-xs text-gray-400">
                        JPG, PNG, WEBP (Max 5MB each) · {MAX_PHOTOS - images.length} of {MAX_PHOTOS} remaining
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        className="hidden"
                        onChange={onPhotosSelected}
                        aria-label="Upload property photos"
                      />
                    </label>
                  )}

                  {photoError && <p className="mt-2 text-xs font-medium text-red-600">{photoError}</p>}

                  {images.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                      {images.map((img, i) => (
                        <div key={`${img.name}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                          <img src={imagePreviews[i]} alt={`Property photo ${i + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            onClick={() => removePhoto(i)}
                            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
                            aria-label={`Remove photo ${i + 1}`}
                          >
                            <XMarkIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="mt-3 text-xs text-gray-400">
                    Photos help tenants understand the property before booking. For better results, upload clear photos taken in good lighting.
                  </p>
                </Field>

                <Field label="Property Video (Optional)" hint="Upload a short video tour of your property.">
                  {!video ? (
                    <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center hover:border-brand-300">
                      <VideoCameraIcon className="h-6 w-6 text-brand-500" />
                      <span className="text-sm font-semibold text-brand-700">Choose Video</span>
                      <span className="text-xs text-gray-400">MP4, WEBM, or MOV</span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        className="hidden"
                        onChange={onVideoSelected}
                        aria-label="Upload property video"
                      />
                    </label>
                  ) : (
                    <div className="space-y-2">
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                      <video src={videoPreviewUrl} controls className="max-h-48 w-full rounded-lg border border-gray-200 bg-black" />
                      <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                        <span className="truncate text-gray-700">Selected video: {video.name}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="cursor-pointer text-xs font-semibold text-brand-700 hover:underline">
                          Replace video
                          <input
                            type="file"
                            accept="video/mp4,video/webm,video/quicktime"
                            className="hidden"
                            onChange={onVideoSelected}
                            aria-label="Upload property video"
                          />
                        </label>
                        <button type="button" onClick={removeVideo} className="text-xs font-semibold text-red-600 hover:underline">
                          Remove Video
                        </button>
                      </div>
                    </div>
                  )}
                  {videoError && <p className="mt-2 text-xs font-medium text-red-600">{videoError}</p>}
                  <p className="mt-3 text-xs text-gray-400">
                    Optional: Upload a short walkthrough video to give tenants a better view of the property.
                  </p>
                </Field>
              </div>

              <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-400">Your business is verified, so this listing will be published immediately — no admin review needed.</p>
                <Button type="submit" loading={loading} className="sm:w-auto">
                  Create Listing
                </Button>
              </div>
            </Card>
          </div>

          {/* RIGHT COLUMN — map preview, tips, privacy */}
          <div className="space-y-6">
            <Card>
              <div className="mb-3 flex items-center gap-2">
                <MapPinIcon className="h-5 w-5 text-brand-600" />
                <h2 className="text-base font-semibold text-gray-900">Location Preview</h2>
              </div>
              {selectedBarangay ? (
                <PropertyMap
                  properties={[
                    {
                      _id: 'preview',
                      propertyName: form.propertyName || 'New property',
                      address: { barangay: selectedBarangay.name, city: 'Dagupan City' },
                      locationCoordinates: { lat: selectedBarangay.lat, lng: selectedBarangay.lng },
                    },
                  ]}
                  center={[selectedBarangay.lat, selectedBarangay.lng]}
                  height={220}
                />
              ) : (
                <div className="flex h-[220px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 text-center">
                  <MapPinIcon className="h-6 w-6 text-gray-300" />
                  <p className="text-xs text-gray-400">Select a barangay to preview the property location.</p>
                </div>
              )}
              <p className="mt-3 text-xs text-gray-400">
                Select a barangay from the dropdown to automatically locate the property on the map and fill in the coordinates.
              </p>
            </Card>

            <Card>
              <div className="mb-3 flex items-center gap-2">
                <LightBulbIcon className="h-5 w-5 text-brand-600" />
                <h2 className="text-base font-semibold text-gray-900">Tips</h2>
              </div>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2">
                  <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600" /> Make sure the property name is accurate and easy to find.
                </li>
                <li className="flex gap-2">
                  <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600" /> Provide a detailed description to attract more tenants.
                </li>
                <li className="flex gap-2">
                  <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600" /> Use the correct and specific street and barangay names.
                </li>
                <li className="flex gap-2">
                  <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600" /> Latitude and longitude are auto-filled once you select the exact barangay.
                </li>
              </ul>
            </Card>

            <Card>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <LockClosedIcon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Your information is secure</p>
                  <p className="mt-1 text-xs text-gray-500">Your property details are only visible to authorized users and verified tenants on Ledger OnBoard.</p>
                </div>
              </div>
            </Card>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
