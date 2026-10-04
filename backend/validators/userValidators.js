const { body } = require('express-validator');
const { FULL_NAME, PH_PHONE } = require('./patterns');
const { normalizePhToE164 } = require('../utils/phoneFormat');
const { toNameCase } = require('../utils/nameCase');

// The registered email and the role are the account's identity, and status, ownership and
// timestamps are system-managed: none of them can be changed from the profile, even by calling the API directly.
const LOCKED_PROFILE_FIELDS = [
  'email', 'role', 'accountStatus', 'fullName', 'assignedLandlordId', 'createdByLandlordId',
  'businessVerificationStatus', 'createdAt', 'updatedAt', '_id', 'id',
];

const nameChain = (field, label) =>
  body(field)
    .optional()
    .trim()
    .customSanitizer(toNameCase)
    .matches(FULL_NAME)
    .withMessage(`${label} must start with an uppercase letter and contain only letters, spaces, hyphens, periods, or apostrophes (min 2 characters)`);

const phoneChain = (field, label) =>
  body(field)
    .optional()
    .trim()
    .customSanitizer(normalizePhToE164)
    .matches(PH_PHONE)
    .withMessage(`${label} must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)`);

const updateProfileValidators = [
  body(LOCKED_PROFILE_FIELDS)
    .not()
    .exists()
    .withMessage('Your email and role cannot be changed from your profile'),
  nameChain('firstName', 'First name'),
  nameChain('lastName', 'Last name'),
  phoneChain('phone', 'Phone'),
  nameChain('emergencyContact.name', 'Emergency contact name'),
  phoneChain('emergencyContact.phone', 'Emergency contact phone'),
  body('notificationPreferences.email').optional().isBoolean().toBoolean(),
  body('notificationPreferences.inApp').optional().isBoolean().toBoolean(),
];

module.exports = { updateProfileValidators };
