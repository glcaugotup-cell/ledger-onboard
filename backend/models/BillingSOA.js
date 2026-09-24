const mongoose = require('mongoose');
const { PAYMENT_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

const billingSOASchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    // Normalized to the 1st of the billed month.
    billingPeriod: { type: Date, required: true },
    baseRent: { type: Number, required: true, min: 0 },
    electricShare: { type: Number, required: true, min: 0, default: 0 },
    waterShare: { type: Number, required: true, min: 0, default: 0 },
    utilityCharge: { type: Number, required: true, min: 0, default: 0 },
    previousArrears: { type: Number, required: true, min: 0, default: 0 },
    totalAmountDue: { type: Number, required: true, min: 0 },
    amountPaid: { type: Number, required: true, min: 0, default: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.UNPAID,
    },
    dueDate: { type: Date, required: true },
    generatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

billingSOASchema.index({ tenantId: 1 });
billingSOASchema.index({ tenantId: 1, billingPeriod: 1 }, { unique: true });
billingSOASchema.index({ paymentStatus: 1 });

module.exports = mongoose.models.BillingSOA || mongoose.model('BillingSOA', billingSOASchema);
