const { body, param } = require('express-validator');

const reviewLandlordVerificationValidators = [
  body('approve').isBoolean().toBoolean(),
  body('rejectionReason').optional().trim().isLength({ max: 500 }),
];

const documentParamValidators = [param('docType').isIn(['permit', 'bir']).withMessage('Invalid document type')];

module.exports = { reviewLandlordVerificationValidators, documentParamValidators };
