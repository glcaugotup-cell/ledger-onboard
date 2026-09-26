const { body } = require('express-validator');

const ROOM_NUMBER_MESSAGE = 'Room number is required (at most 20 characters)';

const createRoomValidators = [
  body('roomNumber').trim().isLength({ min: 1, max: 20 }).withMessage(ROOM_NUMBER_MESSAGE),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be at most 1000 characters'),
  body('capacity').isInt({ min: 1, max: 50 }).withMessage('Capacity must be a whole number from 1 to 50'),
  body('monthlyBaseRent').isFloat({ min: 0, max: 1000000 }).withMessage('Rent must be a number from 0 to 1,000,000'),
  body('amenities').optional().isArray(),
];

const updateRoomValidators = [
  body('roomNumber').optional().trim().isLength({ min: 1, max: 20 }).withMessage(ROOM_NUMBER_MESSAGE),
  body('capacity').optional().isInt({ min: 1, max: 50 }).withMessage('Capacity must be a whole number from 1 to 50'),
  body('monthlyBaseRent').optional().isFloat({ min: 0, max: 1000000 }).withMessage('Rent must be a number from 0 to 1,000,000'),
  body('status').optional().isIn(['available', 'occupied', 'maintenance']).withMessage('Invalid room status'),
];

module.exports = { createRoomValidators, updateRoomValidators };
