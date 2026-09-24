const PropertyReviewRepository = require('../repositories/PropertyReviewRepository');
const ReservationRepository = require('../repositories/ReservationRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const ApiError = require('../utils/ApiError');
const { RESERVATION_STATUS, REVIEW_STATUS } = require('../utils/constants');

/**
 * Former-tenant reviews. Eligibility is derived server-side from the tenant's
 * completed reservations, never from the request body.
 */
class ReviewService {
  /** Reservations this tenant could still leave a review for (drives the unregister-flow prompt). */
  async listEligibleReservations(tenantId) {
    const completed = await ReservationRepository.find(
      { tenantId, status: RESERVATION_STATUS.COMPLETED },
      { populate: 'roomId propertyId' }
    );
    const eligible = [];
    for (const reservation of completed) {
      const existingReview = await PropertyReviewRepository.findByReservation(reservation._id);
      if (!existingReview) eligible.push(reservation);
    }
    return eligible;
  }

  async isEligibleForReservation(tenantId, reservationId) {
    const reservation = await ReservationRepository.findById(reservationId);
    if (!reservation) return false;
    if (String(reservation.tenantId) !== String(tenantId)) return false;
    if (reservation.status !== RESERVATION_STATUS.COMPLETED) return false;
    const existing = await PropertyReviewRepository.findByReservation(reservationId);
    return !existing;
  }

  async submitReview(tenantId, { propertyId, reservationId, rating, comment }) {
    const reservation = await ReservationRepository.findById(reservationId);
    if (!reservation) throw ApiError.notFound('Reservation not found', 'RESERVATION_NOT_FOUND');
    if (String(reservation.tenantId) !== String(tenantId)) {
      throw ApiError.forbidden('This reservation does not belong to you', 'FORBIDDEN_RESERVATION_ACCESS');
    }
    if (reservation.status !== RESERVATION_STATUS.COMPLETED) {
      throw ApiError.badRequest('Only completed tenancies are eligible for a review', 'RESERVATION_NOT_COMPLETED');
    }
    if (String(reservation.propertyId) !== String(propertyId)) {
      throw ApiError.badRequest('Reservation does not match this property', 'PROPERTY_MISMATCH');
    }

    const existing = await PropertyReviewRepository.findByReservation(reservationId);
    if (existing) throw ApiError.conflict('You have already reviewed this tenancy', 'DUPLICATE_REVIEW');

    return PropertyReviewRepository.create({
      propertyId,
      roomId: reservation.roomId,
      tenantId,
      reservationId,
      rating,
      comment,
      status: REVIEW_STATUS.PENDING,
      isVerifiedFormerTenant: true,
    });
  }

  async listApprovedForProperty(propertyId) {
    return PropertyReviewRepository.findApprovedByProperty(propertyId);
  }

  async listPendingModeration() {
    return PropertyReviewRepository.findPendingModeration();
  }

  async moderate(reviewId, admin, { status, reason }) {
    if (![REVIEW_STATUS.APPROVED, REVIEW_STATUS.REJECTED, REVIEW_STATUS.HIDDEN].includes(status)) {
      throw ApiError.badRequest('Invalid moderation status', 'INVALID_STATUS');
    }
    const review = await PropertyReviewRepository.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found', 'REVIEW_NOT_FOUND');

    const updated = await PropertyReviewRepository.updateById(reviewId, {
      status,
      moderationReason: reason || null,
      moderatedBy: admin.id,
      moderatedAt: new Date(),
    });

    await AuditLogRepository.record({
      action: 'REVIEW_MODERATED',
      actorId: admin.id,
      actorRole: admin.role,
      targetType: 'PropertyReview',
      targetId: review._id,
      metadata: { status },
    });

    return updated;
  }
}

module.exports = new ReviewService();
