const mongoose = require('mongoose');

const { Schema } = mongoose;

const occupantEntrySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    electricityKWh: { type: Number, required: true, min: 0 },
    electricityShare: { type: Number, required: true, min: 0 },
    waterShare: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const breakdownEntrySchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    previousReading: { type: Number, required: true, min: 0 },
    currentReading: { type: Number, required: true, min: 0 },
    usageKWh: { type: Number, required: true, min: 0 },
    electricShare: { type: Number, required: true, min: 0 },
    waterShare: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const utilityReadingSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
    caretakerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Normalized to the 1st of the month for uniqueness/lookup, e.g. 2026-09-01.
    readingMonth: { type: Date, required: true },
    prevElectricityKWh: { type: Number, required: true, min: 0 },
    currElectricityKWh: { type: Number, required: true, min: 0 },
    totalElectricBill: { type: Number, required: true, min: 0 },
    totalWaterBill: { type: Number, required: true, min: 0 },
    occupants: [occupantEntrySchema],
    calculatedBreakdown: [breakdownEntrySchema],
  },
  { timestamps: true }
);

utilityReadingSchema.index({ roomId: 1, readingMonth: 1 }, { unique: true });
utilityReadingSchema.index({ caretakerId: 1 });

utilityReadingSchema.pre('validate', function guardReadings(next) {
  if (this.currElectricityKWh < this.prevElectricityKWh) {
    return next(new Error('currElectricityKWh cannot be less than prevElectricityKWh'));
  }
  next();
});

module.exports = mongoose.models.UtilityReading || mongoose.model('UtilityReading', utilityReadingSchema);
