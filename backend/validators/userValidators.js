const { body } = require('express-validator');
const { FULL_NAME, PH_PHONE } = require('./patterns');
const { normalizePhToE164 } = require('../utils/phoneFormat');
const { toNameCase } = require('../utils/nameCase');
const { normalizeAdminPhone, isValidAdminPhone, ADMIN_PHONE_MESSAGE } = require('../utils/adminPhone');
const { ROLES } = require('../utils/constants');

// The registered email and the role are the account's identity, and status, ownership and
// timestamps are system-managed: none of them can be changed from the profile, even by calling the API directly.
const LOCKED_PROFILE_FIELDS = [
  'email', 'role', 'accountStatus', 'fullName', 'assignedLandlordId', 'createdByLandlordId',
  'businessVerificationStatus', 'createdAt', 'updatedAt', '_id', 'id',
  'emailConfirmedAt', 'emailVerified', 'emailMfaEnabledAt', 'emailCodes',
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

// An admin's own phone may be from another listed country; everyone else keeps a Philippine number.
const isAdmin = (req) => req.user?.role === ROLES.ADMIN;
const ownPhoneChain = () =>
  body('phone')
    .optional()
    .trim()
    .customSanitizer((value, { req }) => (isAdmin(req) ? normalizeAdminPhone(value) : normalizePhToE164(value)))
    .custom((value, { req }) => (isAdmin(req) ? isValidAdminPhone(value) : PH_PHONE.test(value)))
    .withMessage((value, { req }) => (isAdmin(req) ? ADMIN_PHONE_MESSAGE : 'Phone must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)'));

const updateProfileValidators = [
  body(LOCKED_PROFILE_FIELDS)
    .not()
    .exists()
    .withMessage('Your email and role cannot be changed from your profile'),
  nameChain('firstName', 'First name'),
  nameChain('lastName', 'Last name'),
  ownPhoneChain(),
  nameChain('emergencyContact.name', 'Emergency contact name'),
  phoneChain('emergencyContact.phone', 'Emergency contact phone'),
  body('notificationPreferences.email').optional().isBoolean().toBoolean(),
  body('notificationPreferences.inApp').optional().isBoolean().toBoolean(),
  body('notificationPreferences.emailCategories.*').optional().isBoolean().withMessage('Email choices must be on or off').toBoolean(),
];

module.exports = { updateProfileValidators };
