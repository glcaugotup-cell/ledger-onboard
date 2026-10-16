const { body, param } = require('express-validator');
const { isStudentIdYearCurrent, lastValidDay } = require('../utils/studentId');

// The longest validity printed on a school ID that we accept (e.g. 2024–2028 is 4 years).
const MAX_VALIDITY_YEARS = 10;

const submitStudentVerificationValidators = [
  body('school').isString().trim().isLength({ min: 2, max: 120 }).withMessage('Enter your school (2 to 120 characters)'),
  body('validFromYear')
    .isInt({ min: 2000, max: 2100 }).withMessage('Enter the first year printed on your ID, like 2024')
    .bail()
    .toInt()
    .custom((from) => from <= new Date().getFullYear() + 1).withMessage("The first year can't be in the future"),
  body('validUntilYear')
    .isInt({ min: 2000, max: 2100 }).withMessage('Enter the last year printed on your ID, like 2028')
    .bail()
    .toInt()
    .custom((until, { req }) => !Number.isInteger(req.body.validFromYear) || until >= req.body.validFromYear).withMessage("The last year can't be before the first year")
    .bail()
    .custom((until, { req }) => !Number.isInteger(req.body.validFromYear) || until - req.body.validFromYear <= MAX_VALIDITY_YEARS)
    .withMessage(`A school ID is valid for at most ${MAX_VALIDITY_YEARS} years`)
    .bail()
    .custom((until) => {
      if (!isStudentIdYearCurrent(until)) throw new Error(`This ID was only valid until ${lastValidDay(until)}. Upload your current school ID.`);
      return true;
    }),
];

const reviewStudentVerificationValidators = [
  body('approve').isBoolean().toBoolean(),
  body('rejectionReason').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }).withMessage('Keep the reason under 500 characters'),
  body('validUntilYear').optional({ values: 'null' }).isInt({ min: 2000, max: 2100 }).withMessage('Enter a year like 2028').toInt(),
];

const studentDocumentParamValidators = [param('docType').isIn(['front', 'back']).withMessage('Invalid document type')];

module.exports = { submitStudentVerificationValidators, reviewStudentVerificationValidators, studentDocumentParamValidators };
