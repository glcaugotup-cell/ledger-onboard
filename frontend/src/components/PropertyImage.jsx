import { HomeModernIcon } from '@heroicons/react/24/outline';
import { mediaUrl } from '../services/apiClient.js';

/**
 * A property's first photo, or a branded placeholder when it has none, so every
 * card and thumbnail keeps the same shape whether or not photos were uploaded.
 */
export default function PropertyImage({ property, className = 'h-40 w-full' }) {
  const image = property?.images?.[0];
  if (image) {
    return <img src={mediaUrl(image)} alt={property.propertyName} loading="lazy" className={`${className} object-cover`} />;
  }
  return (
    <div className={`${className} flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-brand-50 to-brand-100 text-brand-400`}>
      <HomeModernIcon className="h-8 w-8" aria-hidden="true" />
      <span className="text-xs font-medium text-brand-600/70">No photo yet</span>
    </div>
  );
}
