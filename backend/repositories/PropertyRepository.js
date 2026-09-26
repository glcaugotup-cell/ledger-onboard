const BaseRepository = require('./BaseRepository');
const Property = require('../models/Property');

class PropertyRepository extends BaseRepository {
  constructor() {
    super(Property);
  }

  /** Public/tenant-facing search — approved listings only, with filters; `excludeLandlordIds` hides closed landlords' listings. */
  search({ barangay, propertyType, tenantGenderPolicy, minRent, maxRent, university, text } = {}, { skip, limit } = {}, { excludeLandlordIds = [] } = {}) {
    const filter = { listingStatus: 'approved', deletedAt: null };
    if (excludeLandlordIds.length) filter.landlordId = { $nin: excludeLandlordIds };
    if (barangay) filter['address.barangay'] = new RegExp(`^${escapeRegex(barangay)}$`, 'i');
    if (propertyType) filter.propertyType = propertyType;
    if (tenantGenderPolicy) filter.tenantGenderPolicy = tenantGenderPolicy;
    if (university) filter.nearbyUniversities = new RegExp(escapeRegex(university), 'i');
    if (text) filter.$text = { $search: text };

    let query = this.model.find(filter);
    if (typeof skip === 'number') query = query.skip(skip);
    if (typeof limit === 'number') query = query.limit(limit);
    query = query.sort({ createdAt: -1 });

    // Rent range is filtered against Room.monthlyBaseRent, joined here for convenience.
    if (minRent != null || maxRent != null) {
      return this._searchWithRentRange(filter, { minRent, maxRent, skip, limit });
    }
    return query.exec();
  }

  async _searchWithRentRange(filter, { minRent, maxRent, skip, limit }) {
    const rentFilter = {};
    if (minRent != null) rentFilter.$gte = Number(minRent);
    if (maxRent != null) rentFilter.$lte = Number(maxRent);

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: 'rooms',
          localField: '_id',
          foreignField: 'propertyId',
          as: 'rooms',
        },
      },
      { $match: { 'rooms.monthlyBaseRent': rentFilter } },
      { $sort: { createdAt: -1 } },
    ];
    if (typeof skip === 'number') pipeline.push({ $skip: skip });
    if (typeof limit === 'number') pipeline.push({ $limit: limit });
    return this.model.aggregate(pipeline);
  }

  findByLandlord(landlordId) {
    return this.model.find({ landlordId }).sort({ createdAt: -1 }).exec();
  }

  findByCaretaker(caretakerId) {
    return this.model.find({ caretakerIds: caretakerId }).exec();
  }

  findPendingModeration() {
    return this.model.find({ listingStatus: 'pending_moderation' }).sort({ createdAt: 1 }).exec();
  }
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = new PropertyRepository();
