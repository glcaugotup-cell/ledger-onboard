const mongoose = require('mongoose');
const { VERIFICATION_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

/**
 * A student's school ID, reviewed by an admin before they can reserve. One document per
 * submission (resubmissions don't overwrite), like LandlordVerification, which keeps an audit
 * trail. User.studentVerificationStatus mirrors the latest status.
 */
const studentVerificationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // "/uploads/student-verification/<file>" references to GridFS files, served only through an authenticated route.
    idFrontUrl: { type: String, required: true },
    idBackUrl: { type: String, required: true },
    school: { type: String, required: true, trim: true, maxlength: 120 },
    // The years printed on the ID, e.g. 2024 and 2028; the admin may correct validUntilYear on approval.
    validFromYear: { type: Number, required: true, min: 2000, max: 2100 },
    validUntilYear: { type: Number, required: true, min: 2000, max: 2100 },
    status: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.PENDING,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    submittedAt: { type: Date, default: Date.now },
    // Set when the student swaps a photo while the submission is still pending review.
    documentsUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

studentVerificationSchema.index({ tenantId: 1, createdAt: -1 });
studentVerificationSchema.index({ status: 1 });

module.exports = mongoose.models.StudentVerification || mongoose.model('StudentVerification', studentVerificationSchema);
