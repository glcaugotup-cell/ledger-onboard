const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Audit trail for sensitive actions (caretaker creation, reservation decisions,
 * payment verification, review moderation, suspensions/archiving, lifecycle
 * runs), shown to admins via GET /api/admin/logs.
 */
const auditLogSchema = new Schema(
  {
    action: { type: String, required: true, trim: true }, // e.g. 'CARETAKER_CREATED', 'PAYMENT_VERIFIED'
    actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null for system/job-initiated entries
    actorRole: { type: String, default: null },
    targetType: { type: String, default: null }, // e.g. 'User', 'Reservation'
    targetId: { type: Schema.Types.ObjectId, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
    success: { type: Boolean, default: true },
  },
  { timestamps: true }
);

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
