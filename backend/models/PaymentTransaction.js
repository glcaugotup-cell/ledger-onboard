const mongoose = require('mongoose');
const { PAYMENT_METHOD, VERIFICATION_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

const paymentTransactionSchema = new Schema(
  {
    soaId: { type: Schema.Types.ObjectId, ref: 'BillingSOA', required: true },
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    proofImageURL: { type: String, default: null },
    cashCollectedByCaretakerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: VERIFICATION_STATUS.PENDING,
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

paymentTransactionSchema.index({ soaId: 1 });
paymentTransactionSchema.index({ tenantId: 1 });
paymentTransactionSchema.index({ verificationStatus: 1 });

paymentTransactionSchema.pre('validate', function guardEvidence(next) {
  if (this.paymentMethod === 'GCASH_SCREENSHOT' && !this.proofImageURL) {
    return next(new Error('proofImageURL is required for GCASH_SCREENSHOT payments'));
  }
  if (this.paymentMethod === 'CASH_ON_SITE' && !this.cashCollectedByCaretakerId) {
    return next(new Error('cashCollectedByCaretakerId is required for CASH_ON_SITE payments'));
  }
  next();
});

module.exports = mongoose.models.PaymentTransaction || mongoose.model('PaymentTransaction', paymentTransactionSchema);
