import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';

// Vite doesn't resolve Leaflet's default marker image URLs out of the box;
// point them at the CDN copies that ship in the same package version.
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const DAGUPAN_CENTER = [16.0433, 120.3333];

const hasCoords = (p) => p.locationCoordinates?.lat && p.locationCoordinates?.lng;
const toLatLng = (p) => [p.locationCoordinates.lat, p.locationCoordinates.lng];

/** Re-frames the map whenever the set of markers changes: fit many, center one, fall back to Dagupan for none. */
function FitToMarkers({ points }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (points.length === 0) map.setView(DAGUPAN_CENTER, 13);
    else if (points.length === 1) map.setView(points[0], 16);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Flies to a requested marker and opens its popup. `focus` is { id, nonce } so repeat requests re-trigger. */
function FocusMarker({ focus, markerRefs, properties }) {
  const map = useMap();
  useEffect(() => {
    if (!focus?.id) return;
    const target = properties.find((p) => p._id === focus.id);
    if (!target || !hasCoords(target)) return;
    map.flyTo(toLatLng(target), Math.max(map.getZoom(), 16), { duration: 0.6 });
    markerRefs.current[focus.id]?.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.id, focus?.nonce]);
  return null;
}

/**
 * The one Leaflet map component in the app. `fitToMarkers` and `focus` are
 * opt-in (used by the tenant Discover map); the detail page and landlord
 * form previews keep their fixed `center`.
 */
export default function PropertyMap({ properties = [], height = 400, center, linkPrefix = '/tenant/properties', fitToMarkers = false, focus }) {
  const markerRefs = useRef({});
  const mapped = properties.filter(hasCoords);

  return (
    <MapContainer center={center || DAGUPAN_CENTER} zoom={13} style={{ height, width: '100%', borderRadius: '0.75rem' }} scrollWheelZoom={false}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {fitToMarkers && <FitToMarkers points={mapped.map(toLatLng)} />}
      {focus && <FocusMarker focus={focus} markerRefs={markerRefs} properties={mapped} />}
      {mapped.map((p) => (
        <Marker
          key={p._id}
          position={toLatLng(p)}
          icon={markerIcon}
          ref={(m) => {
            if (m) markerRefs.current[p._id] = m;
            else delete markerRefs.current[p._id];
          }}
        >
          <Popup>
            {/* Leaflet's own `.leaflet-popup-content p` margin is ~1.3em; tighten it. */}
            <div className="min-w-[160px] [&_p]:my-0.5!">
            <p className="font-semibold">{p.propertyName}</p>
            <p className="text-xs text-gray-500">
              {p.address?.barangay}, {p.address?.city}
            </p>
            {p.propertyType && <p className="text-xs text-gray-600">{p.propertyType}</p>}
            {typeof p.startingRent === 'number' && (
              <p className="text-xs font-medium text-gray-800">From ₱{p.startingRent.toLocaleString('en-PH')} / month</p>
            )}
            <Link to={`${linkPrefix}/${p._id}`} className="mt-1 inline-block text-xs font-semibold text-brand-600 hover:underline">
              View details
            </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
