const { body } = require('express-validator');
const { FULL_NAME, PH_PHONE } = require('./patterns');

const updateProfileValidators = [
  body('firstName').optional().trim().matches(FULL_NAME).withMessage('First name must start with an uppercase letter and contain only letters, spaces, hyphens, or periods'),
  body('lastName').optional().trim().matches(FULL_NAME).withMessage('Last name must start with an uppercase letter and contain only letters, spaces, hyphens, or periods'),
  body('phone').optional().trim().matches(PH_PHONE).withMessage('Phone must be a valid Philippine mobile number'),
  body('notificationPreferences.email').optional().isBoolean().toBoolean(),
  body('notificationPreferences.inApp').optional().isBoolean().toBoolean(),
];

module.exports = { updateProfileValidators };
