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
  body('referenceNumber').if(body('paymentMethod').equals('GCASH_QR')).trim().isLength({ min: 5, max: 100 }).withMessage('Enter a GCash reference number (5-100 characters)'),
];

const verifyPaymentValidators = [
  body('approve').optional().isBoolean().toBoolean(),
  body('decision').optional().isIn(['COMPLETE', 'SET_BALANCE']).withMessage('Choose complete payment or set the remaining balance'),
  body().custom((_, { req }) => Boolean(req.body.decision) || typeof req.body.approve === 'boolean').withMessage('Choose how to review this payment'),
  body('remainingBalance').if(body('decision').equals('SET_BALANCE')).isFloat({ min: 0, max: 100000000 }).withMessage('Enter a valid remaining balance').bail().custom((value) => /^\d+(\.\d{1,2})?$/.test(String(value))).withMessage('Balance can have at most 2 decimal places').toFloat(),
  body('rejectionReason').optional().trim().isLength({ max: 500 }).withMessage('Reason must be at most 500 characters'),
];

module.exports = { submitPaymentValidators, verifyPaymentValidators };
