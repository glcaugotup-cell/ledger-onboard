const { body } = require('express-validator');
const mongoose = require('mongoose');

const MAX_BILL_AMOUNT = 1000000;
const MAX_METER_READING = 10000000;

const decimalNumber = (field, label, max) =>
  body(field)
    .isFloat({ min: 0, max })
    .withMessage(`${label} must be from 0 to ${max.toLocaleString('en-US')}`)
    .bail()
    .custom((value) => /^\d+(\.\d{1,2})?$/.test(String(value)))
    .withMessage(`${label} can have at most 2 decimal places`)
    .toFloat();

const logReadingValidators = [
  body('roomId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid roomId'),
  body('readingMonth')
    .isISO8601()
    .withMessage('Enter a valid billing month')
    .bail()
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date.getUTCFullYear() > now.getUTCFullYear() || (date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() > now.getUTCMonth())) {
        throw new Error('Billing month cannot be in the future');
      }
      return true;
    })
    .toDate(),
  decimalNumber('totalElectricBill', 'Electric bill', MAX_BILL_AMOUNT),
  decimalNumber('totalWaterBill', 'Water bill', MAX_BILL_AMOUNT),
  body('occupantReadings').isArray({ min: 1, max: 50 }).withMessage('Enter readings for 1 to 50 occupants'),
  body('occupantReadings.*.tenantId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid tenantId'),
  decimalNumber('occupantReadings.*.previousReading', 'Previous meter reading', MAX_METER_READING),
  decimalNumber('occupantReadings.*.currentReading', 'Current meter reading', MAX_METER_READING),
];

module.exports = { logReadingValidators };
