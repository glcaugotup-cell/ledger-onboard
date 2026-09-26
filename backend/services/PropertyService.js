const PropertyRepository = require('../repositories/PropertyRepository');
const RoomRepository = require('../repositories/RoomRepository');
const ReviewRepository = require('../repositories/PropertyReviewRepository');
const UserRepository = require('../repositories/UserRepository');
const ReservationRepository = require('../repositories/ReservationRepository');
const FileStorageService = require('./FileStorageService');
const { FILE_CATEGORIES } = require('./FileStorageService');
const ApiError = require('../utils/ApiError');
const { ACCOUNT_STATUS, LISTING_STATUS, RESERVATION_STATUS, ROLES, VERIFICATION_STATUS } = require('../utils/constants');

/**
 * Tenant discovery (search/filter) and landlord listing management.
 * Ownership always comes from the authenticated user, never the request body.
 */
class PropertyService {
  async search(filters, pagination) {
    // Listings of closed/suspended landlord accounts stay in the database but are hidden from tenants.
    const excludeLandlordIds = await this._inactiveLandlordIds();
    const properties = await PropertyRepository.search(filters, pagination, { excludeLandlordIds });
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

  async _inactiveLandlordIds() {
    const landlords = await UserRepository.find({ role: ROLES.LANDLORD, accountStatus: { $ne: ACCOUNT_STATUS.ACTIVE } }, { select: '_id' });
    return landlords.map((l) => l._id);
  }

  /** True when the listing's landlord can currently take reservations (their account is active). */
  async isLandlordActive(property) {
    const landlord = await UserRepository.findById(property.landlordId, { select: 'accountStatus' });
    return landlord?.accountStatus === ACCOUNT_STATUS.ACTIVE;
  }

  /**
   * Landlord's own listings regardless of moderation status (draft/pending/rejected/approved); deleted ones are left out.
   * Each carries display-only room figures: roomCount, availableRooms, occupiedSlots, totalSlots and startingRent.
   */
  async listMine(landlordId) {
    const properties = (await PropertyRepository.findByLandlord(landlordId)).filter((p) => !p.deletedAt);
    if (!properties.length) return properties;
    const rooms = await RoomRepository.find({ propertyId: { $in: properties.map((p) => p._id) } });
    return properties.map((doc) => {
      const own = rooms.filter((r) => String(r.propertyId) === String(doc._id));
      const rents = own.map((r) => r.monthlyBaseRent);
      return {
        ...doc.toObject(),
        roomCount: own.length,
        availableRooms: own.filter((r) => r.status === 'available' && r.currentOccupancy < r.capacity).length,
        occupiedSlots: own.reduce((sum, r) => sum + r.currentOccupancy, 0),
        totalSlots: own.reduce((sum, r) => sum + r.capacity, 0),
        startingRent: rents.length ? Math.min(...rents) : null,
      };
    });
  }

  async getPublicDetail(propertyId) {
    const property = await PropertyRepository.findById(propertyId);
    if (!property || property.listingStatus !== LISTING_STATUS.APPROVED || !(await this.isLandlordActive(property))) {
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
    const property = await this._findManageable(propertyId);
    this._assertLandlordOwnsOrAdmin(property, requester);
    const rooms = await RoomRepository.findByProperty(propertyId);
    return { property, rooms };
  }

  async create(landlordId, data, media = {}) {
    // The authoritative check; hiding the button on the frontend is only a convenience.
    const landlord = await UserRepository.findById(landlordId);
    if (!landlord || landlord.businessVerificationStatus !== VERIFICATION_STATUS.VERIFIED) {
      throw ApiError.forbidden('Your business must be verified before you can upload a boarding house.', 'BUSINESS_NOT_VERIFIED');
    }

    const { images, videoUrl, stored } = await this._storeMedia(media);
    try {
      // Business rule: admins verify the landlord's business, not each property,
      // so a verified landlord's listings are published (approved) immediately.
      return await PropertyRepository.create({
        ...data,
        // Always from the uploads above, never from the request body.
        images,
        videoUrl,
        landlordId, // always server-derived, never trusted from body
        caretakerIds: [],
        listingStatus: LISTING_STATUS.APPROVED,
      });
    } catch (err) {
      await FileStorageService.deleteByUrls(stored);
      throw err;
    }
  }

  async update(propertyId, requester, updates, media = {}) {
    const property = await this._findManageable(propertyId);
    this._assertLandlordOwnsOrAdmin(property, requester);

    // Whitelist editable fields — landlordId/listingStatus (moderation) are not client-editable here.
    // images/videoUrl only change through actual uploads, so a listing can never point at
    // (and later delete) another listing's files.
    const allowed = ['propertyName', 'description', 'address', 'locationCoordinates', 'propertyType', 'tenantGenderPolicy', 'nearbyUniversities', 'houseRules', 'amenities'];
    const safeUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    const { images, videoUrl, stored } = await this._storeMedia(media);
    if (images.length) safeUpdates.images = images;
    if (videoUrl) safeUpdates.videoUrl = videoUrl;

    let updated;
    try {
      updated = await PropertyRepository.updateById(propertyId, safeUpdates);
      if (!updated) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND'); // deleted meanwhile
    } catch (err) {
      await FileStorageService.deleteByUrls(stored);
      throw err;
    }

    // Remove files the listing no longer references (replaced photos/video).
    const stillUsed = new Set([...(updated.images || []), updated.videoUrl].filter(Boolean));
    const previous = [...(property.images || []), property.videoUrl].filter(Boolean);
    await FileStorageService.deleteByUrls(previous.filter((url) => !stillUsed.has(url)));

    return updated;
  }

  /**
   * "Deletes" a listing as a soft delete: it is marked deleted and inactive, so it
   * disappears from search, the public page and the landlord's list, but the
   * property, its rooms, photos, reservations, bills, payments, readings and
   * reviews all stay in the database and remain traceable in billing/payment
   * history. Refused while tenants still live there, and while reservation
   * requests are waiting for an answer.
   */
  async delete(propertyId, requester) {
    const property = await this._findManageable(propertyId);
    this._assertLandlordOwnsOrAdmin(property, requester);

    const currentTenants = await ReservationRepository.count({ propertyId, status: RESERVATION_STATUS.APPROVED });
    if (currentTenants > 0) {
      throw ApiError.conflict(
        `This property still has ${currentTenants} current tenant${currentTenants === 1 ? '' : 's'}. Complete or cancel their reservations before deleting it.`,
        'PROPERTY_HAS_TENANTS'
      );
    }
    const pendingRequests = await ReservationRepository.count({ propertyId, status: RESERVATION_STATUS.PENDING });
    if (pendingRequests > 0) {
      throw ApiError.conflict(
        `This property has ${pendingRequests} reservation request${pendingRequests === 1 ? '' : 's'} waiting for an answer. Approve or reject ${pendingRequests === 1 ? 'it' : 'them'} before deleting the property.`,
        'PROPERTY_HAS_PENDING_REQUESTS'
      );
    }

    await PropertyRepository.updateById(propertyId, {
      listingStatus: LISTING_STATUS.INACTIVE,
      deletedAt: new Date(),
      deletedBy: requester.id,
    });
    return { deleted: true };
  }

  /** Loads a property that hasn't been (soft-)deleted, for owner/admin management actions. */
  async _findManageable(propertyId) {
    const property = await PropertyRepository.findById(propertyId);
    if (!property || property.deletedAt) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
    return property;
  }

  /** Saves uploaded photos/video to GridFS; `stored` lists everything saved, for rollback. */
  async _storeMedia({ images = [], video = null } = {}) {
    const imageUrls = await FileStorageService.saveUploads(images, FILE_CATEGORIES.PROPERTIES);
    let videoUrl = null;
    if (video) {
      try {
        videoUrl = await FileStorageService.saveUpload(video, FILE_CATEGORIES.PROPERTIES);
      } catch (err) {
        await FileStorageService.deleteByUrls(imageUrls);
        throw err;
      }
    }
    return { images: imageUrls, videoUrl, stored: [...imageUrls, videoUrl].filter(Boolean) };
  }

  async listPendingModeration() {
    return PropertyRepository.findPendingModeration();
  }

  async moderate(propertyId, { status, reason }) {
    if (![LISTING_STATUS.APPROVED, LISTING_STATUS.REJECTED].includes(status)) {
      throw ApiError.badRequest('Invalid moderation status', 'INVALID_STATUS');
    }
    await this._findManageable(propertyId);
    return PropertyRepository.updateById(propertyId, { listingStatus: status, moderationReason: reason || null });
  }

  async listRoomsForProperty(propertyId) {
    return RoomRepository.findByProperty(propertyId);
  }

  /**
   * The landlord's active caretakers for this property, each marked `suitable` when
   * their service barangay matches the property's barangay, with a plain-language
   * reason. Suitable caretakers come first; the landlord still chooses and confirms.
   */
  async listCaretakerSuggestions(propertyId, requester) {
    const property = await this._findManageable(propertyId);
    this._assertLandlordOwnsOrAdmin(property, requester);

    const barangay = property.address?.barangay || '';
    const caretakers = await UserRepository.findCaretakersByLandlord(property.landlordId, { accountStatus: ACCOUNT_STATUS.ACTIVE });
    const assigned = new Set((property.caretakerIds || []).map(String));

    const suggestions = caretakers.map((c) => {
      const suitable = Boolean(c.serviceBarangay) && c.serviceBarangay.toLowerCase() === barangay.toLowerCase();
      let matchReason;
      if (suitable) matchReason = `Works in ${c.serviceBarangay}, the same barangay as this property`;
      else if (c.serviceBarangay) matchReason = `Works in ${c.serviceBarangay}, not ${barangay}`;
      else matchReason = 'No service barangay set for this caretaker yet';
      return {
        _id: c._id,
        fullName: c.fullName,
        email: c.email,
        phone: c.phone,
        serviceBarangay: c.serviceBarangay || null,
        suitable,
        matchReason,
        assigned: assigned.has(String(c._id)),
      };
    });
    suggestions.sort((a, b) => Number(b.suitable) - Number(a.suitable) || a.fullName.localeCompare(b.fullName));
    return { propertyBarangay: barangay, caretakers: suggestions };
  }

  /** Explicit assignment chosen and confirmed by the landlord (or an admin). */
  async assignCaretaker(propertyId, requester, caretakerId) {
    const property = await this._findManageable(propertyId);
    this._assertLandlordOwnsOrAdmin(property, requester);

    const caretaker = await UserRepository.findById(caretakerId);
    if (!caretaker || caretaker.role !== ROLES.CARETAKER || String(caretaker.assignedLandlordId) !== String(property.landlordId)) {
      throw ApiError.badRequest("This caretaker doesn't work for this property's landlord", 'INVALID_CARETAKER');
    }
    if (caretaker.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
      throw ApiError.badRequest('Only an active caretaker account can be assigned', 'CARETAKER_NOT_ACTIVE');
    }

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
