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
