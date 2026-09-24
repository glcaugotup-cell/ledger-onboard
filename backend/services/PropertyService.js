const PropertyRepository = require('../repositories/PropertyRepository');
const RoomRepository = require('../repositories/RoomRepository');
const ReviewRepository = require('../repositories/PropertyReviewRepository');
const UserRepository = require('../repositories/UserRepository');
const ApiError = require('../utils/ApiError');
const { LISTING_STATUS, ROLES, VERIFICATION_STATUS } = require('../utils/constants');

/**
 * Tenant discovery (search/filter) and landlord listing management.
 * Ownership always comes from the authenticated user, never the request body.
 */
class PropertyService {
  async search(filters, pagination) {
    const properties = await PropertyRepository.search(filters, pagination);
    const list = await this._withLandlordVerifiedFlag(properties);
    return this._withStartingRent(list);
  }

  /** Adds `startingRent` (cheapest room's monthlyBaseRent, or null if there are no rooms) for display. */
  async _withStartingRent(list) {
    if (list.length === 0) return list;
    const rows = await RoomRepository.minRentByProperty(list.map((p) => p._id));
    const byId = new Map(rows.map((r) => [String(r._id), r.startingRent]));
    for (const p of list) p.startingRent = byId.get(String(p._id)) ?? null;
    return list;
  }

  /**
   * Adds a `landlordVerified` boolean for tenants — never the verification
   * status or any document reference. Uses a batched lookup instead of
   * populate() because search() may return aggregation results, and converts
   * to plain objects so the extra field survives JSON serialization.
   */
  async _withLandlordVerifiedFlag(properties) {
    const isArray = Array.isArray(properties);
    const list = (isArray ? properties : [properties]).map((p) => (typeof p.toObject === 'function' ? p.toObject() : { ...p }));

    const landlordIds = [...new Set(list.map((p) => String(p.landlordId?._id || p.landlordId)).filter(Boolean))];
    if (landlordIds.length > 0) {
      const landlords = await UserRepository.find({ _id: { $in: landlordIds } }, { select: '_id businessVerificationStatus' });
      const verifiedSet = new Set(landlords.filter((l) => l.businessVerificationStatus === VERIFICATION_STATUS.VERIFIED).map((l) => String(l._id)));
      for (const p of list) {
        p.landlordVerified = verifiedSet.has(String(p.landlordId?._id || p.landlordId));
      }
    } else {
      for (const p of list) p.landlordVerified = false;
    }

    return isArray ? list : list[0];
  }

  /** Landlord's own listings regardless of moderation status (draft/pending/rejected/approved). */
  async listMine(landlordId) {
    return PropertyRepository.findByLandlord(landlordId);
  }

  async getPublicDetail(propertyId) {
    const property = await PropertyRepository.findById(propertyId);
    if (!property || property.listingStatus !== LISTING_STATUS.APPROVED) {
      throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
    }
    const [rooms, reviews] = await Promise.all([
      RoomRepository.findByProperty(propertyId),
      ReviewRepository.findApprovedByProperty(propertyId),
    ]);
    return { property: await this._withLandlordVerifiedFlag(property), rooms, reviews };
  }

  /** Owner/admin detail view — not gated by listingStatus. */
  async getDetailForManagement(propertyId, requester) {
    const property = await PropertyRepository.findById(propertyId);
    if (!property) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
    this._assertLandlordOwnsOrAdmin(property, requester);
    const rooms = await RoomRepository.findByProperty(propertyId);
    return { property, rooms };
  }

  async create(landlordId, data) {
    // The authoritative check; hiding the button on the frontend is only a convenience.
    const landlord = await UserRepository.findById(landlordId);
    if (!landlord || landlord.businessVerificationStatus !== VERIFICATION_STATUS.VERIFIED) {
      throw ApiError.forbidden('Your business must be verified before you can upload a boarding house.', 'BUSINESS_NOT_VERIFIED');
    }

    // Business rule: admins verify the landlord's business, not each property,
    // so a verified landlord's listings are published (approved) immediately.
    return PropertyRepository.create({
      ...data,
      landlordId, // always server-derived, never trusted from body
      caretakerIds: [],
      listingStatus: LISTING_STATUS.APPROVED,
    });
  }

  async update(propertyId, requester, updates) {
    const property = await PropertyRepository.findById(propertyId);
    if (!property) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
    this._assertLandlordOwnsOrAdmin(property, requester);

    // Whitelist editable fields — landlordId/listingStatus (moderation) are not client-editable here.
    const allowed = ['propertyName', 'description', 'address', 'locationCoordinates', 'propertyType', 'tenantGenderPolicy', 'nearbyUniversities', 'houseRules', 'amenities', 'images', 'videoUrl'];
    const safeUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    return PropertyRepository.updateById(propertyId, safeUpdates);
  }

  async delete(propertyId, requester) {
    const property = await PropertyRepository.findById(propertyId);
    if (!property) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
    this._assertLandlordOwnsOrAdmin(property, requester);
    await PropertyRepository.deleteById(propertyId);
    return { deleted: true };
  }

  async listPendingModeration() {
    return PropertyRepository.findPendingModeration();
  }

  async moderate(propertyId, { status, reason }) {
    if (![LISTING_STATUS.APPROVED, LISTING_STATUS.REJECTED].includes(status)) {
      throw ApiError.badRequest('Invalid moderation status', 'INVALID_STATUS');
    }
    const property = await PropertyRepository.findById(propertyId);
    if (!property) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
    return PropertyRepository.updateById(propertyId, { listingStatus: status, moderationReason: reason || null });
  }

  async listRoomsForProperty(propertyId) {
    return RoomRepository.findByProperty(propertyId);
  }

  async assignCaretaker(propertyId, requester, caretakerId) {
    const property = await PropertyRepository.findById(propertyId);
    if (!property) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
    this._assertLandlordOwnsOrAdmin(property, requester);

    if (!property.caretakerIds.some((id) => String(id) === String(caretakerId))) {
      property.caretakerIds.push(caretakerId);
      await property.save();
    }
    return property;
  }

  _assertLandlordOwnsOrAdmin(property, requester) {
    if (requester.role === ROLES.ADMIN) return;
    if (requester.role === ROLES.LANDLORD && String(property.landlordId) === String(requester.id)) return;
    throw ApiError.forbidden('You do not have access to this property', 'NOT_PROPERTY_OWNER');
  }
}

module.exports = new PropertyService();
