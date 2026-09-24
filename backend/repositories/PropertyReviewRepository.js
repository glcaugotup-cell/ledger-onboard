const BaseRepository = require('./BaseRepository');
const PropertyReview = require('../models/PropertyReview');

class PropertyReviewRepository extends BaseRepository {
  constructor() {
    super(PropertyReview);
  }

  /** Public display: approved reviews for a property, newest first. */
  findApprovedByProperty(propertyId) {
    return this.model
      .find({ propertyId, status: 'APPROVED' })
      .populate({ path: 'tenantId', select: 'fullName' })
      .sort({ createdAt: -1 })
      .exec();
  }

  findByReservation(reservationId) {
    return this.model.findOne({ reservationId }).exec();
  }

  findPendingModeration() {
    return this.model.find({ status: 'PENDING' }).populate('tenantId propertyId').sort({ createdAt: 1 }).exec();
  }

  findByTenant(tenantId) {
    return this.model.find({ tenantId }).sort({ createdAt: -1 }).exec();
  }
}

module.exports = new PropertyReviewRepository();
