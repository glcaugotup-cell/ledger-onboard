import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlassIcon, MapIcon, XMarkIcon } from '@heroicons/react/24/outline';
import PropertyApi from '../services/PropertyApi.js';
import PropertyCard from './PropertyCard.jsx';
import PropertyMap from './map/PropertyMap.jsx';
import { Field, Select, TextInput } from './ui/Field.jsx';
import { EmptyState, ErrorBanner, LoadingState } from './ui/Feedback.jsx';
import { DAGUPAN_BARANGAYS } from '../data/dagupanBarangays.js';

/**
 * Shared search/filter + results. `mapSection` (tenant Discover) swaps the
 * Grid/Map toggle for an always-visible grid plus ONE permanent map section
 * below it, both fed by the same `properties` state so filters update cards
 * and markers together. Without it (landing page) the original toggle stays.
 */
const EMPTY_FILTERS = { barangay: '', propertyType: '', tenantGenderPolicy: '', minRent: '', maxRent: '', text: '' };

export default function DiscoverContent({ linkPrefix = '/tenant/properties', mapSection = false }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState('grid');
  const [mapFocus, setMapFocus] = useState(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (filters.minRent !== '' && filters.maxRent !== '' && Number(filters.minRent) > Number(filters.maxRent)) return undefined;
    const timeout = setTimeout(() => {
      setLoading(true);
      setError('');
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
      PropertyApi.search(params)
        .then(({ properties: list }) => setProperties(list))
        .catch(() => {
          setProperties([]);
          setError('Could not load properties. Please try again.');
        })
        .finally(() => setLoading(false));
    }, 300); // light debounce so typing doesn't fire a request per keystroke
    return () => clearTimeout(timeout);
  }, [filters]);

  const update = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });
  const activeFilters = Object.values(filters).filter((v) => v !== '').length;
  const rentRangeInvalid = filters.minRent !== '' && filters.maxRent !== '' && Number(filters.minRent) > Number(filters.maxRent);

  const scrollToMap = () => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const showOnMap = (property) => {
    setMapFocus((prev) => ({ id: property._id, nonce: (prev?.nonce || 0) + 1 }));
    scrollToMap();
  };

  const countLabel = loading ? 'Searching…' : `${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} found`;

  return (
    <div>
      <div
        role="search"
        aria-label="Filter boarding houses"
        className={`mb-6 grid grid-cols-2 gap-3 border border-gray-200 bg-white lg:grid-cols-4 ${mapSection ? 'rounded-2xl p-4 shadow-sm sm:p-5' : 'rounded-xl p-4 shadow-sm'}`}
      >
        <div className="col-span-2">
          <Field label="Search">
            <div className="relative">
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <TextInput placeholder="Name, description…" value={filters.text} onChange={update('text')} className="pl-9" />
            </div>
          </Field>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Barangay">
            <Select value={filters.barangay} onChange={update('barangay')}>
              <option value="">Any</option>
              {DAGUPAN_BARANGAYS.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Property type">
            <Select value={filters.propertyType} onChange={update('propertyType')}>
              <option value="">Any</option>
              {['Room Only', 'Apartment', 'Bedspace', 'Studio'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <Field label="Gender policy">
            <Select value={filters.tenantGenderPolicy} onChange={update('tenantGenderPolicy')}>
              <option value="">Any</option>
              {['Female Only', 'Male Only', 'Co-Ed'].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Min rent (₱)" error={rentRangeInvalid ? 'Higher than max rent' : undefined}>
          <TextInput type="number" min="0" inputMode="numeric" value={filters.minRent} onChange={update('minRent')} placeholder="e.g. 1500" error={rentRangeInvalid} />
        </Field>
        <Field label="Max rent (₱)">
          <TextInput type="number" min="0" inputMode="numeric" value={filters.maxRent} onChange={update('maxRent')} placeholder="e.g. 3000" />
        </Field>
        <div className="col-span-2 flex items-end sm:col-span-1">
          <button
            type="button"
            onClick={() => setFilters(EMPTY_FILTERS)}
            disabled={activeFilters === 0}
            className="inline-flex min-h-[2.5rem] w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
            Clear filters{activeFilters > 0 ? ` (${activeFilters})` : ''}
          </button>
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className={mapSection ? 'text-sm font-medium text-gray-700' : 'text-sm text-gray-500'}>{countLabel}</p>
        {mapSection ? (
          <button
            type="button"
            onClick={scrollToMap}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50"
          >
            <MapIcon className="h-4 w-4" /> Map view
          </button>
        ) : (
          <div className="flex gap-1 rounded-lg border border-gray-200 p-1 text-xs">
            <button onClick={() => setView('grid')} className={`rounded px-2 py-1 ${view === 'grid' ? 'bg-brand-100 text-brand-700' : 'text-gray-500'}`}>
              Grid
            </button>
            <button onClick={() => setView('map')} className={`rounded px-2 py-1 ${view === 'map' ? 'bg-brand-100 text-brand-700' : 'text-gray-500'}`}>
              Map
            </button>
          </div>
        )}
      </div>

      <ErrorBanner message={error} />
      {loading && <LoadingState label="Searching boarding houses in Dagupan City…" />}

      {!loading && !error && properties.length === 0 && (
        <EmptyState title="No properties match your filters" description="Try widening your search — a different barangay or a higher rent cap." />
      )}

      {!loading && properties.length > 0 && (mapSection || view === 'grid') && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <PropertyCard key={p._id} property={p} linkPrefix={linkPrefix} onShowOnMap={mapSection ? showOnMap : undefined} />
          ))}
        </div>
      )}

      {!mapSection && !loading && properties.length > 0 && view === 'map' && <PropertyMap properties={properties} height={520} linkPrefix={linkPrefix} />}

      {mapSection && (
        // Always mounted (even while a new search loads or when nothing
        // matches) so there is exactly one Leaflet instance on the page.
        <section ref={mapRef} aria-labelledby="discover-map-heading" className="mt-10 scroll-mt-24">
          <h2 id="discover-map-heading" className="text-lg font-semibold text-gray-900">
            Find boarding houses on the map
          </h2>
          <p className="mb-4 text-sm text-gray-500">Explore available boarding houses around Dagupan City.</p>
          <div className="relative isolate h-[360px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-sm sm:h-[420px] lg:h-[520px]">
            <PropertyMap properties={properties} height="100%" linkPrefix={linkPrefix} fitToMarkers focus={mapFocus} />
            {!loading && properties.length === 0 && (
              <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center p-4">
                <p className="rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-medium text-gray-700 shadow-md">
                  {error ? 'Properties could not be loaded.' : 'No boarding houses match your current filters.'}
                </p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
