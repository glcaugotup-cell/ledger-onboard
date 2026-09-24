const { body } = require('express-validator');
const mongoose = require('mongoose');
const { RESERVATION_STATUS } = require('../utils/constants');

const createReservationValidators = [
  body('roomId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid roomId'),
  body('moveInDate').isISO8601().toDate(),
  body('moveOutDate').optional({ nullable: true }).isISO8601().toDate(),
];

const updateReservationStatusValidators = [
  body('status').isIn(Object.values(RESERVATION_STATUS)),
  body('rejectionReason').optional().trim().isLength({ max: 500 }),
  body('caretakerAssignedId')
    .optional({ nullable: true })
    .custom((v) => mongoose.isValidObjectId(v))
    .withMessage('Invalid caretakerAssignedId'),
];

module.exports = { createReservationValidators, updateReservationStatusValidators };
