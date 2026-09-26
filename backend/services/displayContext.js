const UserRepository = require('../repositories/UserRepository');
const RoomRepository = require('../repositories/RoomRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const BillingSOARepository = require('../repositories/BillingSOARepository');

/**
 * Read-only display labels for billing and payment lists, so screens can show
 * who and where a record belongs to. Only adds fields (tenantName, roomNumber,
 * propertyName, billingPeriod); every existing field and id is left unchanged.
 * Lookups are batched: one query per collection, not per record.
 */
const toPlain = (doc) => (typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc });
const unique = (ids) => [...new Set(ids.filter(Boolean).map(String))];

async function lookup(tenantIds, roomIds) {
  const [tenants, rooms] = await Promise.all([
    tenantIds.length ? UserRepository.find({ _id: { $in: tenantIds } }, { select: '_id fullName' }) : [],
    roomIds.length ? RoomRepository.find({ _id: { $in: roomIds } }, { select: '_id roomNumber propertyId' }) : [],
  ]);
  const propertyIds = unique(rooms.map((r) => r.propertyId));
  const properties = propertyIds.length ? await PropertyRepository.find({ _id: { $in: propertyIds } }, { select: '_id propertyName' }) : [];
  return {
    tenantName: new Map(tenants.map((t) => [String(t._id), t.fullName])),
    room: new Map(rooms.map((r) => [String(r._id), r])),
    propertyName: new Map(properties.map((p) => [String(p._id), p.propertyName])),
  };
}

/** Adds tenantName, roomNumber and propertyName to statements of account. */
async function withSoaContext(soas) {
  if (!soas.length) return soas;
  const names = await lookup(unique(soas.map((s) => s.tenantId)), unique(soas.map((s) => s.roomId)));
  return soas.map((soa) => {
    const plain = toPlain(soa);
    const room = names.room.get(String(plain.roomId));
    return {
      ...plain,
      tenantName: names.tenantName.get(String(plain.tenantId)) || null,
      roomNumber: room?.roomNumber || null,
      propertyName: room ? names.propertyName.get(String(room.propertyId)) || null : null,
    };
  });
}

/** Adds tenantName, billingPeriod, roomNumber and propertyName to payments. */
async function withPaymentContext(payments) {
  if (!payments.length) return payments;
  const soas = await BillingSOARepository.find({ _id: { $in: unique(payments.map((p) => p.soaId)) } }, { select: '_id roomId billingPeriod' });
  const soaById = new Map(soas.map((s) => [String(s._id), s]));
  const names = await lookup(unique(payments.map((p) => p.tenantId)), unique(soas.map((s) => s.roomId)));
  return payments.map((payment) => {
    const plain = toPlain(payment);
    const soa = soaById.get(String(plain.soaId));
    const room = soa && names.room.get(String(soa.roomId));
    return {
      ...plain,
      tenantName: names.tenantName.get(String(plain.tenantId)) || null,
      billingPeriod: soa?.billingPeriod || null,
      roomNumber: room?.roomNumber || null,
      propertyName: room ? names.propertyName.get(String(room.propertyId)) || null : null,
    };
  });
}

module.exports = { withSoaContext, withPaymentContext };
