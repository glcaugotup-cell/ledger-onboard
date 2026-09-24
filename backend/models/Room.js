const mongoose = require('mongoose');
const { ROOM_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

const roomSchema = new Schema(
  {
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    roomNumber: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    capacity: { type: Number, required: true, min: 1 },
    currentOccupancy: { type: Number, required: true, min: 0, default: 0 },
    monthlyBaseRent: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(ROOM_STATUS),
      default: ROOM_STATUS.AVAILABLE,
    },
    amenities: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

roomSchema.index({ propertyId: 1 });
roomSchema.index({ propertyId: 1, roomNumber: 1 }, { unique: true });
roomSchema.index({ status: 1 });

// currentOccupancy must never exceed capacity — guarded at the schema
// level as a last line of defense; the RoomService is the primary
// enforcement point.
roomSchema.pre('validate', function guardOccupancy(next) {
  if (this.currentOccupancy > this.capacity) {
    return next(new Error('currentOccupancy cannot exceed room capacity'));
  }
  next();
});

module.exports = mongoose.models.Room || mongoose.model('Room', roomSchema);
