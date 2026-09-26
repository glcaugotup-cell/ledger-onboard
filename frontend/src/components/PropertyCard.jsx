import { Link } from 'react-router-dom';
import { CheckBadgeIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { Badge } from './ui/Feedback.jsx';
import PropertyImage from './PropertyImage.jsx';
import { formatPeso } from '../utils/format.js';

/**
 * `onShowOnMap` is optional (tenant Discover only): when given, a "Show on
 * map" action renders below the card's link — outside it, so the button
 * never nests inside the <a>.
 */
export default function PropertyCard({ property, linkPrefix = '/tenant/properties', onShowOnMap }) {
  const hasCoords = property.locationCoordinates?.lat && property.locationCoordinates?.lng;
  const hasRent = property.startingRent !== null && property.startingRent !== undefined;
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0">
      <Link
        to={`${linkPrefix}/${property._id}`}
        className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
      >
        <div className="relative">
          <PropertyImage property={property} className="h-44 w-full" />
          <span className="absolute left-3 top-3">
            <Badge tone="brand">{property.propertyType}</Badge>
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="font-semibold text-gray-900 group-hover:text-brand-700">{property.propertyName}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-gray-500">
            <MapPinIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {property.address?.barangay}, {property.address?.city}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone="gray">{property.tenantGenderPolicy}</Badge>
            {property.landlordVerified && (
              <Badge tone="green">
                <CheckBadgeIcon className="-ml-0.5 mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Verified Business
              </Badge>
            )}
          </div>
          <p className="mt-auto pt-3 text-sm text-gray-500">
            {hasRent ? (
              <>
                From <span className="text-base font-bold text-gray-900">{formatPeso(property.startingRent)}</span>
                <span className="text-gray-500"> / month</span>
              </>
            ) : (
              'No rooms listed yet'
            )}
          </p>
        </div>
      </Link>
      {onShowOnMap && hasCoords && (
        <button
          type="button"
          onClick={() => onShowOnMap(property)}
          className="flex cursor-pointer items-center justify-center gap-1.5 border-t border-gray-100 px-4 py-2.5 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400"
        >
          <MapPinIcon className="h-4 w-4" aria-hidden="true" /> Show on map
        </button>
      )}
    </div>
  );
}
