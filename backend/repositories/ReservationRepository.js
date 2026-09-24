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
    return this.model.find({ caretakerAssignedId: caretakerId }).populate('tenantId roomId').sort({ createdAt: -1 }).exec();
  }

  findActiveByTenantAndRoom(tenantId, roomId) {
    return this.model
      .findOne({ tenantId, roomId, status: { $in: ['pending', 'approved'] } })
      .exec();
  }

  findCompletedByTenantAndRoom(tenantId, roomId) {
    return this.model.findOne({ tenantId, roomId, status: 'completed' }).exec();
  }

  async caretakerIsAssignedToRoom(caretakerId, roomId) {
    const match = await this.model.exists({
      roomId,
      caretakerAssignedId: caretakerId,
      status: { $in: ['approved', 'completed'] },
    });
    return Boolean(match);
  }

  findActiveTenantIdsForRoom(roomId) {
    return this.model.find({ roomId, status: 'approved' }).select('tenantId').exec();
  }
}

module.exports = new ReservationRepository();
