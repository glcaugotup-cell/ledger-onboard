const { body } = require('express-validator');

const createRoomValidators = [
  body('roomNumber').trim().notEmpty(),
  body('description').optional().trim().isLength({ max: 1000 }),
  body('capacity').isInt({ min: 1 }),
  body('monthlyBaseRent').isFloat({ min: 0 }),
  body('amenities').optional().isArray(),
];

const updateRoomValidators = [
  body('roomNumber').optional().trim().notEmpty(),
  body('capacity').optional().isInt({ min: 1 }),
  body('monthlyBaseRent').optional().isFloat({ min: 0 }),
  body('status').optional().isIn(['available', 'occupied', 'maintenance']),
];

module.exports = { createRoomValidators, updateRoomValidators };
