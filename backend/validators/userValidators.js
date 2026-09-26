const { body } = require('express-validator');
const { PH_PHONE } = require('./patterns');
const { normalizePhToE164 } = require('../utils/phoneFormat');

// Name and email are the account's registered identity: shown on the profile but never editable through this endpoint.
const updateProfileValidators = [
  body(['firstName', 'lastName', 'fullName', 'email'])
    .not()
    .exists()
    .withMessage('Your name and email cannot be changed from your profile'),
  body('phone')
    .optional()
    .trim()
    .customSanitizer(normalizePhToE164)
    .matches(PH_PHONE)
    .withMessage('Phone must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)'),
  body('notificationPreferences.email').optional().isBoolean().toBoolean(),
  body('notificationPreferences.inApp').optional().isBoolean().toBoolean(),
];

module.exports = { updateProfileValidators };
