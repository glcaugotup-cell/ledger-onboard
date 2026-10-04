const mongoose = require('mongoose');
const { RESERVATION_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

const reservationSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    status: {
      type: String,
      enum: Object.values(RESERVATION_STATUS),
      default: RESERVATION_STATUS.PENDING,
    },
    moveInDate: { type: Date, required: true },
    moveOutDate: { type: Date, default: null },
    caretakerAssignedId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
    movedInAt: { type: Date, default: null },
    movedOutAt: { type: Date, default: null },
    noShowAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    // 'tenant', 'landlord', 'admin' or 'system' (automatic cancellation after a move-in elsewhere).
    cancelledBy: { type: String, default: null },
    cancellationReason: { type: String, trim: true, maxlength: 500, default: null },
    // Tenant's request to end a current stay; the landlord approves (then marks moved out) or declines.
    leaveRequest: {
      status: { type: String, enum: ['pending', 'approved', 'declined', null], default: null },
      requestedAt: { type: Date, default: null },
      note: { type: String, trim: true, maxlength: 500, default: '' },
      decidedAt: { type: Date, default: null },
      declineReason: { type: String, trim: true, maxlength: 500, default: null },
      balanceAtDecision: { type: Number, default: null },
    },
  },
  { timestamps: true }
);

reservationSchema.index({ tenantId: 1 });
reservationSchema.index({ propertyId: 1 });
reservationSchema.index({ roomId: 1, status: 1 });

reservationSchema.pre('validate', function guardDates(next) {
  if (this.moveOutDate && this.moveInDate && this.moveOutDate <= this.moveInDate) {
    return next(new Error('moveOutDate must be after moveInDate'));
  }
  next();
});

module.exports = mongoose.models.Reservation || mongoose.model('Reservation', reservationSchema);
