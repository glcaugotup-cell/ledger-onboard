const PropertyReviewRepository = require('../repositories/PropertyReviewRepository');
const ReservationRepository = require('../repositories/ReservationRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const NotificationService = require('./NotificationService');
const ApiError = require('../utils/ApiError');
const { RESERVATION_STATUS, REVIEW_STATUS } = require('../utils/constants');

const idOf = (value) => String(value?._id || value || '');

const links = {
  landlordReview: (propertyId, reviewId) => `/landlord/properties/${idOf(propertyId)}?review=${idOf(reviewId)}#reviews`,
  tenantStay: (reservationId) => `/tenant/apartment?stay=${idOf(reservationId)}#past-stays`,
};

/** "4/5" plus the comment (shortened) for notification messages. */
function describeRating(rating, comment) {
  const text = (comment || '').trim();
  const short = text.length > 160 ? `${text.slice(0, 157)}…` : text;
  return `${rating}/5${short ? `: “${short}”` : ' (no comment)'}`;
}

/**
 * Former-tenant reviews. Eligibility is derived server-side from the tenant's completed
 * reservations, never from the request body. Reviews are published right away; the
 * landlord is notified of every new, edited or deleted review, and an admin can hide one.
 */
class ReviewService {
  /** Reservations this tenant could still leave a review for (drives the rating prompt). */
  async listEligibleReservations(tenantId) {
    const completed = await ReservationRepository.find(
      { tenantId, status: RESERVATION_STATUS.COMPLETED },
      { populate: 'roomId propertyId' }
    );
    const eligible = [];
    for (const reservation of completed) {
      // A review the tenant deleted still counts, so the prompt doesn't come back; they can rate again from My Apartment.
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
    return !existing || Boolean(existing.deletedAt);
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
    if (existing && !existing.deletedAt) throw ApiError.conflict('You have already reviewed this tenancy', 'DUPLICATE_REVIEW');

    let review;
    if (existing) {
      // One review per tenancy: rating a stay again after deleting the review brings the same record back.
      // A review an admin hid stays hidden.
      const keepHidden = [REVIEW_STATUS.HIDDEN, REVIEW_STATUS.REJECTED].includes(existing.status);
      review = await PropertyReviewRepository.updateById(existing._id, {
        rating,
        comment: comment ?? '',
        deletedAt: null,
        editedAt: new Date(),
        status: keepHidden ? existing.status : REVIEW_STATUS.APPROVED,
      });
    } else {
      review = await PropertyReviewRepository.create({
        propertyId,
        roomId: reservation.roomId,
        tenantId,
        reservationId,
        rating,
        comment,
        status: REVIEW_STATUS.APPROVED,
        isVerifiedFormerTenant: true,
      });
    }

    await this._notifyLandlord(review, 'REVIEW_SUBMITTED', 'New tenant review', (who, place) => `${who} rated ${place} ${describeRating(review.rating, review.comment)}`);
    return review;
  }

  /** The tenant changes the stars and/or comment of their own review. Moderation status is kept. */
  async updateReview(tenantId, reviewId, { rating, comment }) {
    const review = await this._ownReview(tenantId, reviewId);
    const updated = await PropertyReviewRepository.updateById(review._id, {
      rating,
      ...(comment !== undefined ? { comment } : {}),
      editedAt: new Date(),
    });
    await this._notifyLandlord(updated, 'REVIEW_UPDATED', 'Tenant review edited', (who, place) => `${who} edited their review of ${place} (was ${review.rating}/5). Now ${describeRating(updated.rating, updated.comment)}`);
    return updated;
  }

  /** Soft delete by the tenant: hidden everywhere, kept on record. */
  async deleteReview(tenantId, reviewId) {
    const review = await this._ownReview(tenantId, reviewId);
    const updated = await PropertyReviewRepository.updateById(review._id, { deletedAt: new Date() });
    await AuditLogRepository.record({
      action: 'REVIEW_DELETED_BY_TENANT',
      actorId: tenantId,
      actorRole: 'tenant',
      targetType: 'PropertyReview',
      targetId: review._id,
      metadata: { rating: review.rating },
    });
    await this._notifyLandlord(updated, 'REVIEW_DELETED', 'Tenant review deleted', (who, place) => `${who} deleted their ${review.rating}/5 review of ${place}.`);
    return updated;
  }

  async listForTenant(tenantId) {
    return PropertyReviewRepository.findByTenant(tenantId);
  }

  async listApprovedForProperty(propertyId) {
    return PropertyReviewRepository.findApprovedByProperty(propertyId);
  }

  async listPendingModeration() {
    return PropertyReviewRepository.findPendingModeration();
  }

  async listForAdmin() {
    return PropertyReviewRepository.findForAdmin();
  }

  async moderate(reviewId, admin, { status, reason }) {
    if (![REVIEW_STATUS.APPROVED, REVIEW_STATUS.REJECTED, REVIEW_STATUS.HIDDEN].includes(status)) {
      throw ApiError.badRequest('Invalid moderation status', 'INVALID_STATUS');
    }
    const review = await PropertyReviewRepository.findById(reviewId);
    if (!review || review.deletedAt) throw ApiError.notFound('Review not found', 'REVIEW_NOT_FOUND');

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

    if (status !== review.status) await this._notifyModeration(updated, status, reason);
    return updated;
  }

  async _ownReview(tenantId, reviewId) {
    const review = await PropertyReviewRepository.findById(reviewId);
    if (!review || review.deletedAt) throw ApiError.notFound('Review not found', 'REVIEW_NOT_FOUND');
    if (String(review.tenantId) !== String(tenantId)) {
      throw ApiError.forbidden('This review does not belong to you', 'FORBIDDEN_REVIEW_ACCESS');
    }
    return review;
  }

  async _context(review) {
    const [property, tenant] = await Promise.all([
      PropertyRepository.findById(review.propertyId),
      UserRepository.findById(review.tenantId, { select: 'fullName' }),
    ]);
    return { property, who: tenant?.fullName || 'A former tenant', place: property?.propertyName || 'your property' };
  }

  async _notifyLandlord(review, type, title, buildMessage) {
    const { property, who, place } = await this._context(review);
    if (!property?.landlordId) return;
    await NotificationService.notify({
      userId: property.landlordId,
      type,
      title,
      message: buildMessage(who, place),
      relatedType: 'PropertyReview',
      relatedId: review._id,
      link: links.landlordReview(property._id, review._id),
    });
  }

  async _notifyModeration(review, status, reason) {
    const { property, place } = await this._context(review);
    const shown = status === REVIEW_STATUS.APPROVED;
    const because = reason ? ` Reason: ${reason}` : '';
    await NotificationService.notify({
      userId: review.tenantId,
      type: shown ? 'REVIEW_PUBLISHED' : 'REVIEW_HIDDEN',
      title: shown ? 'Your review is visible' : 'Your review was hidden',
      message: shown ? `Your review of ${place} is now shown on the property page.` : `An admin hid your review of ${place}.${because}`,
      relatedType: 'PropertyReview',
      relatedId: review._id,
      link: links.tenantStay(review.reservationId),
    });
    if (property?.landlordId) {
      await NotificationService.notify({
        userId: property.landlordId,
        type: shown ? 'REVIEW_PUBLISHED' : 'REVIEW_HIDDEN',
        title: shown ? 'A review is visible' : 'A review was hidden',
        message: shown ? `A ${review.rating}/5 review of ${place} is now shown on your listing.` : `An admin hid a ${review.rating}/5 review of ${place}.${because}`,
        relatedType: 'PropertyReview',
        relatedId: review._id,
        link: links.landlordReview(property._id, review._id),
      });
    }
  }
}

module.exports = new ReviewService();
