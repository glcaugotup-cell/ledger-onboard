const mongoose = require('mongoose');

const { Schema } = mongoose;

/** Persisted in-app notifications, read via GET /api/notifications. */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, trim: true }, // e.g. 'RESERVATION_APPROVED', 'PAYMENT_VERIFIED'
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    relatedType: { type: String, default: null },
    relatedId: { type: Schema.Types.ObjectId, default: null },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
