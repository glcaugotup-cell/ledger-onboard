const mongoose = require('mongoose');
const { PROPERTY_TYPE, GENDER_POLICY, LISTING_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

const propertySchema = new Schema(
  {
    landlordId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    caretakerIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    propertyName: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 4000, default: '' },
    address: {
      street: { type: String, trim: true, required: true },
      barangay: { type: String, trim: true, required: true },
      city: { type: String, trim: true, required: true, default: 'Dagupan City' },
      province: { type: String, trim: true, required: true, default: 'Pangasinan' },
    },
    locationCoordinates: {
      lat: { type: Number, min: -90, max: 90, required: true },
      lng: { type: Number, min: -180, max: 180, required: true },
    },
    propertyType: {
      type: String,
      enum: Object.values(PROPERTY_TYPE),
      required: true,
    },
    tenantGenderPolicy: {
      type: String,
      enum: Object.values(GENDER_POLICY),
      required: true,
      default: GENDER_POLICY.CO_ED,
    },
    nearbyUniversities: [{ type: String, trim: true }],
    houseRules: [{ type: String, trim: true }],
    amenities: [{ type: String, trim: true }],
    images: [{ type: String, trim: true }],
    // Optional single video tour, served from GridFS at the same public
    // /uploads/properties route as images; never required to create a listing.
    videoUrl: { type: String, trim: true, default: null },
    listingStatus: {
      type: String,
      enum: Object.values(LISTING_STATUS),
      default: LISTING_STATUS.DRAFT,
    },
  },
  { timestamps: true }
);

propertySchema.index({ landlordId: 1 });
propertySchema.index({ 'address.barangay': 1 });
propertySchema.index({ listingStatus: 1 });
// Supports discovery text search on the fields tenants actually search by.
propertySchema.index({ propertyName: 'text', description: 'text', 'address.barangay': 'text' });

module.exports = mongoose.models.Property || mongoose.model('Property', propertySchema);
