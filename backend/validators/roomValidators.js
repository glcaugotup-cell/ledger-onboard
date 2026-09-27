const { body } = require('express-validator');

const ROOM_NUMBER_MESSAGE = 'Room number is required (at most 20 characters)';
const rentAmountChain = (field = 'monthlyBaseRent') =>
  body(field)
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('Rent must be from 0 to 1,000,000')
    .bail()
    .custom((value) => /^\d+(\.\d{1,2})?$/.test(String(value)))
    .withMessage('Rent can have at most 2 decimal places')
    .toFloat();

const createRoomValidators = [
  body('roomNumber').trim().isLength({ min: 1, max: 20 }).withMessage(ROOM_NUMBER_MESSAGE),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be at most 1000 characters'),
  body('capacity').isInt({ min: 1, max: 50 }).withMessage('Capacity must be a whole number from 1 to 50'),
  rentAmountChain(),
  body('amenities').optional().isArray(),
];

const updateRoomValidators = [
  body('roomNumber').optional().trim().isLength({ min: 1, max: 20 }).withMessage(ROOM_NUMBER_MESSAGE),
  body('capacity').optional().isInt({ min: 1, max: 50 }).withMessage('Capacity must be a whole number from 1 to 50'),
  rentAmountChain().optional(),
  body('status').optional().isIn(['available', 'occupied', 'maintenance']).withMessage('Invalid room status'),
];

module.exports = { createRoomValidators, updateRoomValidators };
