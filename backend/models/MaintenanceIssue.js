const mongoose = require('mongoose');
const { MAINTENANCE_STATUS } = require('../utils/constants');
const { Schema } = mongoose;

const statusHistorySchema = new Schema({
  status: { type: String, required: true },
  // What happened, e.g. 'reported', 'assigned', 'marked_done', 'confirmed', 'reopened', 'removed', 'restored'.
  event: { type: String, required: true },
  at: { type: Date, default: Date.now },
  byRole: { type: String, default: null },
  by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  note: { type: String, trim: true, maxlength: 2000, default: '' },
}, { _id: false });

const issueSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  landlordId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  caretakerId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  reservationId: { type: Schema.Types.ObjectId, ref: 'Reservation', required: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  urgency: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  photos: [{ type: String }],
  status: { type: String, enum: Object.values(MAINTENANCE_STATUS), default: MAINTENANCE_STATUS.PENDING, index: true },
  internalNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  targetDate: { type: Date, default: null },
  landlordUpdate: { type: String, trim: true, maxlength: 2000, default: '' },
  // When the landlord or caretaker marked the work done (the issue then waits for the tenant to confirm).
  doneAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
  resolutionNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  proofPhotos: [{ type: String }],
  statusHistory: { type: [statusHistorySchema], default: [] },
  // Soft "deletes": each one only hides the issue from one list and can be restored.
  tenantArchivedAt: { type: Date, default: null },
  caretakerArchivedAt: { type: Date, default: null },
  removedAt: { type: Date, default: null },
  removedReason: { type: String, trim: true, maxlength: 500, default: null },
  removedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

issueSchema.index({ landlordId:  1, status: 1, createdAt: -1 });
issueSchema.index({ caretakerId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.MaintenanceIssue || mongoose.model('MaintenanceIssue', issueSchema);
