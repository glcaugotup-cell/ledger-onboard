const mongoose = require('mongoose');
const { REVIEW_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

const propertyReviewSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reservationId: { type: Schema.Types.ObjectId, ref: 'Reservation', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 2000, default: '' },
    status: {
      type: String,
      enum: Object.values(REVIEW_STATUS),
      default: REVIEW_STATUS.PENDING,
    },
    isVerifiedFormerTenant: { type: Boolean, default: true },
    moderationReason: { type: String, default: null },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

propertyReviewSchema.index({ propertyId: 1, status: 1, createdAt: -1 });
// One review per completed tenancy.
propertyReviewSchema.index({ reservationId: 1 }, { unique: true });

module.exports = mongoose.models.PropertyReview || mongoose.model('PropertyReview', propertyReviewSchema);
