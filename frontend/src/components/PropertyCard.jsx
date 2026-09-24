import { Link } from 'react-router-dom';
import { MapPinIcon } from '@heroicons/react/24/outline';
import { Badge } from './ui/Feedback.jsx';

/**
 * `onShowOnMap` is optional (tenant Discover only): when given, a "Show on
 * map" action renders below the card's link — outside it, so the button
 * never nests inside the <a>.
 */
export default function PropertyCard({ property, linkPrefix = '/tenant/properties', onShowOnMap }) {
  const image = property.images?.[0];
  const hasCoords = property.locationCoordinates?.lat && property.locationCoordinates?.lng;
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link to={`${linkPrefix}/${property._id}`} className="block flex-1">
        <div className="h-40 w-full bg-gray-100">
          {image ? (
            <img src={image} alt={property.propertyName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-gray-300">No image</div>
          )}
        </div>
        <div className="p-4">
          <div className="mb-1 flex items-start justify-between gap-2">
            <h3 className="font-semibold text-gray-900">{property.propertyName}</h3>
            <Badge tone="brand">{property.propertyType}</Badge>
          </div>
          <p className="text-sm text-gray-500">
            {property.address?.barangay}, {property.address?.city}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <Badge tone="gray">{property.tenantGenderPolicy}</Badge>
            {property.landlordVerified && <Badge tone="green">✓ Verified Business</Badge>}
          </div>
        </div>
      </Link>
      {onShowOnMap && hasCoords && (
        <button
          type="button"
          onClick={() => onShowOnMap(property)}
          className="flex cursor-pointer items-center justify-center gap-1.5 border-t border-gray-100 px-4 py-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
        >
          <MapPinIcon className="h-4 w-4" /> Show on map
        </button>
      )}
    </div>
  );
}
