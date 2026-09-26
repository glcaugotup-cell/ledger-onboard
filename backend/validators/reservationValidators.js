const { body } = require('express-validator');
const mongoose = require('mongoose');
const { RESERVATION_STATUS } = require('../utils/constants');
const { appDateKey, inputDateKey } = require('../utils/dates');

const createReservationValidators = [
  body('roomId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid roomId'),
  // Today (Philippine date) or later; checked here so a request that skips the date picker is still rejected.
  body('moveInDate')
    .isISO8601()
    .withMessage('Enter a valid move-in date')
    .bail()
    .custom((value) => {
      if (inputDateKey(value) < appDateKey()) throw new Error('Move-in date cannot be in the past.');
      return true;
    })
    .toDate(),
  body('moveOutDate').optional({ nullable: true }).isISO8601().withMessage('Enter a valid move-out date').toDate(),
];

const updateReservationStatusValidators = [
  body('status').isIn(Object.values(RESERVATION_STATUS)).withMessage('Invalid reservation status'),
  body('rejectionReason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be at most 500 characters'),
  body('caretakerAssignedId')
    .optional({ nullable: true })
    .custom((v) => mongoose.isValidObjectId(v))
    .withMessage('Invalid caretakerAssignedId'),
];

module.exports = { createReservationValidators, updateReservationStatusValidators };
