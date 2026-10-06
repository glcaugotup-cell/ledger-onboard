const BaseRepository = require('./BaseRepository');
const PropertyReview = require('../models/PropertyReview');

class PropertyReviewRepository extends BaseRepository {
  constructor() {
    super(PropertyReview);
  }

  /** Public display: approved reviews for a property that the tenant hasn't deleted, newest first. */
  findApprovedByProperty(propertyId) {
    return this.model
      .find({ propertyId, status: 'APPROVED', deletedAt: null })
      .populate({ path: 'tenantId', select: 'fullName' })
      .sort({ createdAt: -1 })
      .exec();
  }

  findByReservation(reservationId) {
    return this.model.findOne({ reservationId }).exec();
  }

  findPendingModeration() {
    return this.model.find({ status: 'PENDING', deletedAt: null }).populate('tenantId propertyId').sort({ createdAt: 1 }).exec();
  }

  /** Admin list: every review the tenant hasn't deleted, newest first. */
  findForAdmin() {
    return this.model
      .find({ deletedAt: null })
      .populate({ path: 'tenantId', select: 'fullName email' })
      .populate({ path: 'propertyId', select: 'propertyName' })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** The tenant's own reviews (deleted ones left out), with the property and room for display. */
  findByTenant(tenantId) {
    return this.model
      .find({ tenantId, deletedAt: null })
      .populate({ path: 'propertyId', select: 'propertyName' })
      .populate({ path: 'roomId', select: 'roomNumber' })
      .sort({ createdAt: -1 })
      .exec();
  }

  /** Average rating and count of published reviews for each property (only properties that have any). */
  ratingSummaryByProperty(propertyIds) {
    return this.model.aggregate([
      { $match: { propertyId: { $in: propertyIds }, status: 'APPROVED', deletedAt: null } },
      { $group: { _id: '$propertyId', averageRating: { $avg: '$rating' }, reviewCount: { $sum: 1 } } },
    ]);
  }
}

module.exports = new PropertyReviewRepository();
