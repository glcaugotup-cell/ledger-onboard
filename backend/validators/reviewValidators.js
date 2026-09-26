const { body } = require('express-validator');
const mongoose = require('mongoose');

const submitReviewValidators = [
  body('reservationId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid reservationId'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').optional().trim().isLength({ max: 2000 }).withMessage('Comment must be at most 2000 characters'),
];

const moderateReviewValidators = [
  body('status').isIn(['APPROVED', 'REJECTED', 'HIDDEN']),
  body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be at most 500 characters'),
];

module.exports = { submitReviewValidators, moderateReviewValidators };
