import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRightOnRectangleIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon, MapPinIcon, WifiIcon } from '@heroicons/react/24/outline';
import PropertyApi from '../services/PropertyApi.js';
import ReservationApi from '../services/ReservationApi.js';
import { mediaUrl } from '../services/apiClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import PropertyMap from './map/PropertyMap.jsx';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import { Badge, ErrorBanner, LoadingState, SuccessBanner } from './ui/Feedback.jsx';

function Stars({ rating }) {
  return (
    <span className="text-amber-500">
      {'★'.repeat(Math.round(rating))}
      {'☆'.repeat(5 - Math.round(rating))}
    </span>
  );
}

/** Large primary image + clickable thumbnail strip. Gracefully adapts down to 1 or 0 real uploaded images — never invents placeholder photos. */
function Gallery({ images, propertyName }) {
  const [active, setActive] = useState(0);

  if (!images?.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 text-sm text-gray-400 sm:h-96">
        No photos yet
      </div>
    );
  }

  const showNav = images.length > 1;

  return (
    <div>
      <div className="relative h-64 overflow-hidden rounded-2xl bg-gray-100 sm:h-96">
        <img src={mediaUrl(images[active])} alt={propertyName} className="h-full w-full object-cover" />
        {showNav && (
          <>
            <button
              type="button"
              aria-label="Previous photo"
              onClick={() => setActive((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-700 shadow-sm transition-colors hover:bg-white"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next photo"
              onClick={() => setActive((i) => (i + 1) % images.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-2 text-gray-700 shadow-sm transition-colors hover:bg-white"
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>
            <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
              {active + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {showNav && (
        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((img, i) => (
            <button
              key={img}
              type="button"
              aria-label={`Show photo ${i + 1}`}
              onClick={() => setActive(i)}
              className={`h-16 overflow-hidden rounded-lg border-2 transition-colors sm:h-20 ${i === active ? 'border-brand-600' : 'border-transparent hover:border-gray-200'}`}
            >
              <img src={mediaUrl(img)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PropertyDetailContent() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [moveInDate, setMoveInDate] = useState('');
  const [reserving, setReserving] = useState(false);
  const [reserveMessage, setReserveMessage] = useState('');
  const [reserveError, setReserveError] = useState('');

  useEffect(() => {
    setLoading(true);
    PropertyApi.getPublicDetail(id)
      .then(setData)
      .catch(() => setError('This property could not be found.'))
      .finally(() => setLoading(false));
  }, [id]);

  /** Signed-out visitors are sent to the landing page; signed-in users get the reservation form. */
  function onReserveClick(room) {
    if (!user) {
      navigate('/');
      return;
    }
    setReserveError('');
    setSelectedRoom(room);
  }

  const onReserve = async (e) => {
    e.preventDefault();
    setReserving(true);
    setReserveError('');
    try {
      await ReservationApi.create({ roomId: selectedRoom._id, moveInDate });
      setReserveMessage('Reservation request submitted! The landlord will review it shortly.');
      setSelectedRoom(null);
    } catch (err) {
      setReserveError(err.message || 'Could not submit reservation.');
    } finally {
      setReserving(false);
    }
  };

  if (loading) return <LoadingState label="Loading property…" />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { property, rooms, reviews } = data;
  const avgRating = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;

  return (
    <div>
      <Gallery images={property.images} propertyName={property.propertyName} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        <div className="lg:col-span-2">
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">{property.propertyName}</h1>
          <div className="mb-3 mt-2 flex flex-wrap gap-2">
            <Badge tone="brand">{property.propertyType}</Badge>
            <Badge tone="gray">{property.tenantGenderPolicy}</Badge>
            {property.landlordVerified && <Badge tone="green">✓ Verified Business</Badge>}
          </div>
          <p className="flex items-start gap-1.5 text-sm text-gray-500">
            <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            {property.address.street}, {property.address.barangay}, {property.address.city}, {property.address.province}
          </p>
          {avgRating && (
            <p className="mt-2 text-sm">
              <Stars rating={avgRating} /> <span className="text-gray-500">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
            </p>
          )}

          <p className="mb-6 mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-700">{property.description}</p>

          {!!property.nearbyUniversities?.length && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Nearby</h3>
              <div className="flex flex-wrap gap-2">
                {property.nearbyUniversities.map((u) => (
                  <Badge key={u} tone="blue">
                    {u}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {!!property.amenities?.length && (
            <div className="mb-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <WifiIcon className="h-4 w-4 text-gray-400" /> Amenities
              </h3>
              <div className="flex flex-wrap gap-2">
                {property.amenities.map((a) => (
                  <Badge key={a}>{a}</Badge>
                ))}
              </div>
            </div>
          )}

          {!!property.houseRules?.length && (
            <div className="mb-6">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <HomeIcon className="h-4 w-4 text-gray-400" /> House rules
              </h3>
              <ul className="list-inside list-disc space-y-1 text-sm text-gray-600">
                {property.houseRules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-gray-100 pt-6">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">Location</h3>
            <div className="h-72 overflow-hidden rounded-2xl border border-gray-200">
              <PropertyMap properties={[property]} center={[property.locationCoordinates.lat, property.locationCoordinates.lng]} height={288} />
            </div>
          </div>

          <div className="mt-6 border-t border-gray-100 pt-6">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">Reviews</h3>
            {reviews.length === 0 && <p className="text-sm text-gray-400">No reviews yet.</p>}
            <div className="space-y-3">
              {reviews.map((r) => (
                <Card key={r._id}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">{r.tenantId?.fullName || 'Former tenant'}</p>
                    {r.isVerifiedFormerTenant && <Badge tone="green">Verified Former Tenant</Badge>}
                  </div>
                  <Stars rating={r.rating} />
                  {r.comment && <p className="mt-1 text-sm text-gray-600">{r.comment}</p>}
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-6">
          <Card title="Available rooms">
            <SuccessBanner message={reserveMessage} />
            <div className="space-y-3">
              {rooms.map((room) => {
                const isAvailable = room.status === 'available' && room.currentOccupancy < room.capacity;
                return (
                  <div key={room._id} className="rounded-xl border border-gray-200 p-3.5">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900">Room {room.roomNumber}</p>
                      <Badge tone={room.status === 'available' ? 'green' : room.status === 'occupied' ? 'red' : 'yellow'}>{room.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-gray-500">₱{room.monthlyBaseRent.toLocaleString()} / month per slot</p>
                    <p className="text-xs text-gray-400">
                      {room.currentOccupancy}/{room.capacity} occupied
                    </p>
                    {isAvailable &&
                      (user ? (
                        <Button variant="secondary" className="mt-3 w-full" onClick={() => onReserveClick(room)}>
                          Reserve this room
                        </Button>
                      ) : (
                        <>
                          <Button variant="primary" className="mt-3 w-full gap-1.5" onClick={() => onReserveClick(room)}>
                            <ArrowRightOnRectangleIcon className="h-4 w-4" /> Login to Reserve
                          </Button>
                          <p className="mt-1.5 text-center text-xs text-gray-400">Sign in to reserve this room.</p>
                        </>
                      ))}
                  </div>
                );
              })}
              {rooms.length === 0 && <p className="text-sm text-gray-400">No rooms listed yet.</p>}
            </div>
          </Card>

          {selectedRoom && (
            <Card title={`Reserve Room ${selectedRoom.roomNumber}`} className="mt-4">
              <form onSubmit={onReserve} className="space-y-3">
                <ErrorBanner message={reserveError} />
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-gray-700">Preferred move-in date</span>
                  <input
                    type="date"
                    required
                    value={moveInDate}
                    onChange={(e) => setMoveInDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex gap-2">
                  <Button type="submit" loading={reserving} className="flex-1">
                    Submit request
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setSelectedRoom(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
