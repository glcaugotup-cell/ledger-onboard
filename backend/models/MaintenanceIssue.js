const mongoose = require('mongoose');
const { Schema } = mongoose;

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
  status: { type: String, enum: ['pending', 'in_progress', 'resolved'], default: 'pending', index: true },
  internalNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  targetDate: { type: Date, default: null },
  landlordUpdate: { type: String, trim: true, maxlength: 2000, default: '' },
  resolvedAt: { type: Date, default: null },
  resolutionNotes: { type: String, trim: true, maxlength: 2000, default: '' },
  proofPhotos: [{ type: String }],
}, { timestamps: true });

issueSchema.index({ landlordId:  1, status: 1, createdAt: -1 });
issueSchema.index({ caretakerId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.MaintenanceIssue || mongoose.model('MaintenanceIssue', issueSchema);
