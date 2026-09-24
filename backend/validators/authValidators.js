const { body } = require('express-validator');
const { FULL_NAME, GMAIL, PH_PHONE, OTP, STRONG_PASSWORD } = require('./patterns');
const { ROLES } = require('../utils/constants');
const { toNameCase } = require('../utils/nameCase');
const { normalizePhToE164 } = require('../utils/phoneFormat');

// customSanitizer runs before .matches() and writes back to req.body, so "angelo" or
// "09171234567" becomes "Angelo" / "+639171234567", matching the frontend's normalization.
const firstNameChain = body('firstName')
  .trim()
  .customSanitizer(toNameCase)
  .matches(FULL_NAME)
  .withMessage('First name must start with an uppercase letter and contain only letters, spaces, hyphens, or periods (min 2 characters)');

const lastNameChain = body('lastName')
  .trim()
  .customSanitizer(toNameCase)
  .matches(FULL_NAME)
  .withMessage('Last name must start with an uppercase letter and contain only letters, spaces, hyphens, or periods (min 2 characters)');

const emailChain = body('email').trim().toLowerCase().matches(GMAIL).withMessage('Email must be a valid @gmail.com address');

const phoneChain = body('phone')
  .trim()
  .customSanitizer(normalizePhToE164)
  .matches(PH_PHONE)
  .withMessage('Phone must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)');

const strongPasswordChain = (field = 'password') =>
  body(field)
    .matches(STRONG_PASSWORD)
    .withMessage('Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number, and a special character');

const privacyConsentChain = body('privacyConsent')
  .custom((value) => value === true)
  .withMessage('You must agree to the Privacy Policy to register');

// Emergency contact is required for tenants only.
const emergencyContactNameChain = body('emergencyContact.name')
  .if((value, { req }) => req.body.role === ROLES.TENANT)
  .trim()
  .customSanitizer(toNameCase)
  .matches(FULL_NAME)
  .withMessage('Emergency contact name must start with an uppercase letter and contain only letters, spaces, hyphens, or periods (min 2 characters)');

const emergencyContactPhoneChain = body('emergencyContact.phone')
  .if((value, { req }) => req.body.role === ROLES.TENANT)
  .trim()
  .customSanitizer(normalizePhToE164)
  .matches(PH_PHONE)
  .withMessage('Emergency contact phone must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)');

const registerValidators = [
  firstNameChain,
  lastNameChain,
  emailChain,
  phoneChain,
  strongPasswordChain('password'),
  body('role').isIn([ROLES.TENANT, ROLES.LANDLORD]).withMessage('role must be tenant or landlord'),
  privacyConsentChain,
  emergencyContactNameChain,
  emergencyContactPhoneChain,
];

const loginValidators = [emailChain, body('password').notEmpty().withMessage('Password is required')];

const forgotPasswordValidators = [emailChain];

const verifyOtpValidators = [
  emailChain,
  body('code').matches(OTP).withMessage('Code must be exactly 6 digits'),
  body('purpose').isIn(['login_mfa', 'password_reset', 'email_verification']),
];

const resendOtpValidators = [emailChain];

const cancelRegistrationValidators = [emailChain];

const resetPasswordValidators = [emailChain, body('code').matches(OTP).withMessage('Code must be exactly 6 digits'), strongPasswordChain('newPassword')];

const changePasswordValidators = [body('currentPassword').notEmpty(), strongPasswordChain('newPassword')];

const createCaretakerValidators = [firstNameChain, lastNameChain, emailChain, phoneChain];

const activateCaretakerValidators = [body('token').notEmpty(), strongPasswordChain('password')];

const accountRecoveryValidators = [emailChain, strongPasswordChain('newPassword')];

const mfaPreferenceValidators = [body('enabled').isBoolean().withMessage('enabled must be a boolean').toBoolean()];

module.exports = {
  firstNameChain,
  lastNameChain,
  registerValidators,
  loginValidators,
  forgotPasswordValidators,
  verifyOtpValidators,
  resendOtpValidators,
  cancelRegistrationValidators,
  resetPasswordValidators,
  changePasswordValidators,
  createCaretakerValidators,
  activateCaretakerValidators,
  accountRecoveryValidators,
  mfaPreferenceValidators,
};
