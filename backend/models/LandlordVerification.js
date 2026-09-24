const mongoose = require('mongoose');
const { VERIFICATION_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

/**
 * One document per submission (resubmissions don't overwrite), which keeps an
 * audit trail. User.businessVerificationStatus mirrors the latest status.
 */
const landlordVerificationSchema = new Schema(
  {
    landlordId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Private relative paths under uploadDir, served only through an authenticated route.
    mayorBusinessPermitUrl: { type: String, required: true },
    birForm2303Url: { type: String, required: true },
    status: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.PENDING,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

landlordVerificationSchema.index({ landlordId: 1, createdAt: -1 });
landlordVerificationSchema.index({ status: 1 });

module.exports = mongoose.models.LandlordVerification || mongoose.model('LandlordVerification', landlordVerificationSchema);
