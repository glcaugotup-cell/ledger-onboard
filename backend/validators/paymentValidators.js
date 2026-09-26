const { body } = require('express-validator');
const mongoose = require('mongoose');

const submitPaymentValidators = [
  body('soaId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid soaId'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be greater than 0'),
  body('paymentMethod').isIn(['GCASH_SCREENSHOT', 'CASH_ON_SITE']).withMessage('Invalid payment method'),
];

const verifyPaymentValidators = [
  body('approve').isBoolean().toBoolean(),
  body('rejectionReason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be at most 500 characters'),
];

module.exports = { submitPaymentValidators, verifyPaymentValidators };
