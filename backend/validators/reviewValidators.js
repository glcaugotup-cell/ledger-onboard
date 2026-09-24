const { body } = require('express-validator');
const mongoose = require('mongoose');

const submitReviewValidators = [
  body('reservationId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid reservationId'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 2000 }),
];

const moderateReviewValidators = [
  body('status').isIn(['APPROVED', 'REJECTED', 'HIDDEN']),
  body('reason').optional().trim().isLength({ max: 500 }),
];

module.exports = { submitReviewValidators, moderateReviewValidators };
