const { body } = require('express-validator');
const { FULL_NAME, GMAIL, PH_PHONE, OTP, STRONG_PASSWORD, WHITESPACE } = require('./patterns');
const { findBarangayByName } = require('../utils/dagupanBarangays');
const { ROLES } = require('../utils/constants');
const { toNameCase } = require('../utils/nameCase');
const { normalizePhToE164 } = require('../utils/phoneFormat');

// customSanitizer runs before .matches() and writes back to req.body, so "angelo" or
// "09171234567" becomes "Angelo" / "+639171234567", matching the frontend's normalization.
const firstNameChain = body('firstName')
  .trim()
  .customSanitizer(toNameCase)
  .matches(FULL_NAME)
  .withMessage('First name must start with an uppercase letter and contain only letters, spaces, hyphens, periods, or apostrophes (min 2 characters)');

const lastNameChain = body('lastName')
  .trim()
  .customSanitizer(toNameCase)
  .matches(FULL_NAME)
  .withMessage('Last name must start with an uppercase letter and contain only letters, spaces, hyphens, periods, or apostrophes (min 2 characters)');

const emailChain = body('email').trim().toLowerCase().matches(GMAIL).withMessage('Email must be a valid @gmail.com address');

const buildPhoneChain = () =>
  body('phone')
    .trim()
    .customSanitizer(normalizePhToE164)
    .matches(PH_PHONE)
    .withMessage('Phone must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)');

const phoneChain = buildPhoneChain();

// Spaces are rejected first with their own message, then the strength rules apply.
const strongPasswordChain = (field = 'password') =>
  body(field)
    .isString()
    .withMessage('Password is required')
    .bail()
    .not()
    .matches(WHITESPACE)
    .withMessage('Password must not contain spaces.')
    .bail()
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
  .withMessage('Emergency contact name must start with an uppercase letter and contain only letters, spaces, hyphens, periods, or apostrophes (min 2 characters)');

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

// Caretakers only: the barangay they work in, used to suggest them for properties there.
// Chains are built fresh each time: calling .optional() on a shared chain would change it everywhere it's used.
const buildServiceBarangayChain = () =>
  body('serviceBarangay')
    .trim()
    .notEmpty()
    .withMessage('Select the barangay this caretaker works in')
    .bail()
    .custom((value) => {
      if (!findBarangayByName(value)) throw new Error('Select a valid Dagupan City barangay from the list');
      return true;
    });

const createCaretakerValidators = [firstNameChain, lastNameChain, emailChain, phoneChain, buildServiceBarangayChain()];

// Landlords may update a caretaker's contact number and service area; the name and email are their identity and stay fixed.
const updateCaretakerValidators = [
  body(['firstName', 'lastName', 'fullName', 'email']).not().exists().withMessage("A caretaker's name and email cannot be changed"),
  buildPhoneChain().optional(),
  buildServiceBarangayChain().optional(),
];

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
  updateCaretakerValidators,
  activateCaretakerValidators,
  accountRecoveryValidators,
  mfaPreferenceValidators,
};
