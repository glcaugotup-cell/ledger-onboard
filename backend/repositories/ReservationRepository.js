const BaseRepository = require('./BaseRepository');
const Reservation = require('../models/Reservation');

class ReservationRepository extends BaseRepository {
  constructor() {
    super(Reservation);
  }

  findByTenant(tenantId) {
    return this.model.find({ tenantId }).populate('roomId propertyId').sort({ createdAt: -1 }).exec();
  }

  findByProperty(propertyId) {
    return this.model.find({ propertyId }).populate('tenantId roomId').sort({ createdAt: -1 }).exec();
  }

  findByLandlordProperties(propertyIds) {
    return this.model
      .find({ propertyId: { $in: propertyIds } })
      .populate('tenantId roomId propertyId')
      .sort({ createdAt: -1 })
      .exec();
  }

  findByCaretaker(caretakerId) {
    // Same shape as the tenant and landlord lists, so caretaker screens can name the property.
    return this.model.find({ caretakerAssignedId: caretakerId }).populate('tenantId roomId propertyId').sort({ createdAt: -1 }).exec();
  }

  findActiveByTenantAndRoom(tenantId, roomId) {
    return this.model
      .findOne({ tenantId, roomId, status: { $in: ['pending', 'approved', 'active'] } })
      .exec();
  }

  findCompletedByTenantAndRoom(tenantId, roomId) {
    return this.model.findOne({ tenantId, roomId, status: 'completed' }).exec();
  }

  /** The tenant's current stay (moved in), if any. */
  findCurrentStayForTenant(tenantId, { excludeId } = {}) {
    const filter = { tenantId, status: 'active' };
    if (excludeId) filter._id = { $ne: excludeId };
    return this.model.findOne(filter).exec();
  }

  /** The tenant's other open requests (pending or reserved), e.g. to cancel them after a move-in elsewhere. */
  findOpenRequestsForTenant(tenantId, { excludeId } = {}) {
    const filter = { tenantId, status: { $in: ['pending', 'approved'] } };
    if (excludeId) filter._id = { $ne: excludeId };
    return this.model.find(filter).populate('roomId propertyId').exec();
  }

  async caretakerIsAssignedToRoom(caretakerId, roomId) {
    const match = await this.model.exists({
      roomId,
      caretakerAssignedId: caretakerId,
      status: { $in: ['approved', 'active', 'completed'] },
    });
    return Boolean(match);
  }

  /** Occupants who have moved in. Billing uses only these, never reserved (held) slots. */
  findActiveTenantIdsForRoom(roomId) {
    return this.model.find({ roomId, status: 'active' }).select('tenantId').exec();
  }
}

module.exports = new ReservationRepository();
