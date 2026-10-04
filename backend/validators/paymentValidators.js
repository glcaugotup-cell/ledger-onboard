const { body } = require('express-validator');
const mongoose = require('mongoose');

const submitPaymentValidators = [
  body('soaId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Invalid soaId'),
  body('amount')
    .isFloat({ gt: 0, max: 100000000 })
    .withMessage('Amount must be greater than 0 and no more than 100,000,000')
    .bail()
    .custom((value) => /^\d+(\.\d{1,2})?$/.test(String(value)))
    .withMessage('Amount can have at most 2 decimal places')
    .toFloat(),
  body('paymentMethod').isIn(['GCASH_SCREENSHOT', 'GCASH_QR', 'CASH_ON_SITE']).withMessage('Invalid payment method'),
  // Spaces and dashes are formatting; what remains must be 10-13 digits (kept as a string for leading zeros).
  body('referenceNumber')
    .if(body('paymentMethod').equals('GCASH_QR'))
    .customSanitizer((value) => String(value ?? '').replace(/[\s-]/g, ''))
    .matches(/^\d{10,13}$/)
    .withMessage('Reference number must be 10 to 13 digits.'),
];

const verifyPaymentValidators = [
  body('approve').optional().isBoolean().toBoolean(),
  body('decision').optional().isIn(['COMPLETE', 'SET_BALANCE']).withMessage('Choose complete payment or set the remaining balance'),
  body().custom((_, { req }) => Boolean(req.body.decision) || typeof req.body.approve === 'boolean').withMessage('Choose how to review this payment'),
  body('remainingBalance').if(body('decision').equals('SET_BALANCE')).isFloat({ min: 0, max: 100000000 }).withMessage('Enter a valid remaining balance').bail().custom((value) => /^\d+(\.\d{1,2})?$/.test(String(value))).withMessage('Balance can have at most 2 decimal places').toFloat(),
  body('rejectionReason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be at most 500 characters'),
];

module.exports = { submitPaymentValidators, verifyPaymentValidators };
