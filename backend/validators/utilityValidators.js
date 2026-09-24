const { body } = require('express-validator');
const mongoose = require('mongoose');

const logReadingValidators = [
  body('roomId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid roomId'),
  body('readingMonth').isISO8601().toDate(),
  body('totalElectricBill').isFloat({ min: 0 }),
  body('totalWaterBill').isFloat({ min: 0 }),
  body('occupantReadings').isArray({ min: 1 }).withMessage('At least one occupant reading is required'),
  body('occupantReadings.*.tenantId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid tenantId'),
  body('occupantReadings.*.previousReading').isFloat({ min: 0 }).withMessage('previousReading cannot be negative'),
  body('occupantReadings.*.currentReading').isFloat({ min: 0 }).withMessage('currentReading cannot be negative'),
];

module.exports = { logReadingValidators };
