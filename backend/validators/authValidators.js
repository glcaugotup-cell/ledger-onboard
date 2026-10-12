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

// Applied to a fresh body('email') each time (optionally after an .if()), so one use can't change another.
const withEmailRules = (chain) => chain.trim().isLength({ max: 254 }).withMessage('Email must be at most 254 characters').bail().toLowerCase().matches(GMAIL).withMessage('Email must be a valid @gmail.com address');
const emailChain = withEmailRules(body('email'));

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
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters long')
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

const loginValidators = [emailChain, body('password').isString().notEmpty().withMessage('Password is required').bail().isLength({ max: 256 }).withMessage('Password must be 256 characters or fewer')];

const forgotPasswordValidators = [emailChain];

// A two-factor code: 6 digits from the authenticator app, or a backup code (XXXXX-XXXXX; any case, dash or space optional).
const MFA_CODE = /^(\d{6}|[A-Za-z0-9]{5}[-\s]?[A-Za-z0-9]{5})$/;
const MFA_CODE_MESSAGE = 'Enter the 6-digit code from your authenticator app, or a backup code';
const isLoginMfa = () => body('purpose').equals('login_mfa');
const isNotLoginMfa = () => body('purpose').not().equals('login_mfa');

// Sign-up verification names the account by email; the two-factor sign-in step uses the challenge token from /login.
const verifyOtpValidators = [
  body('purpose').isIn(['login_mfa', 'password_reset', 'email_verification']),
  withEmailRules(body('email').if(isNotLoginMfa())),
  body('code').if(isNotLoginMfa()).matches(OTP).withMessage('Code must be exactly 6 digits'),
  body('challengeToken').if(isLoginMfa()).isString().withMessage('Sign in again to get a new code request').bail().notEmpty().withMessage('Sign in again to get a new code request').isLength({ max: 2000 }),
  body('code').if(isLoginMfa()).isString().bail().trim().matches(MFA_CODE).withMessage(MFA_CODE_MESSAGE),
];

const resendOtpValidators = [emailChain];

const cancelRegistrationValidators = [emailChain];

// An authenticator code (6 digits), an admin reset code (XXXX-XXXX) or a backup code (XXXXX-XXXXX);
// any case, the dash or a space optional.
const RESET_CODE = /^(\d{6}|[A-Za-z0-9]{4}[-\s]?[A-Za-z0-9]{4}|[A-Za-z0-9]{5}[-\s]?[A-Za-z0-9]{5})$/;
const RESET_CODE_MESSAGE = 'Enter your authenticator, backup or reset code';
const resetCodeChain = () => body('code').isString().withMessage(RESET_CODE_MESSAGE).bail().trim().matches(RESET_CODE).withMessage(RESET_CODE_MESSAGE);
const resetPasswordValidators = [emailChain, resetCodeChain(), strongPasswordChain('newPassword')];

// The code (authenticator or backup) is required by AuthService only when two-factor is on.
const changePasswordValidators = [
  body('currentPassword').notEmpty(),
  strongPasswordChain('newPassword'),
  body('code').optional().isString().bail().trim().matches(MFA_CODE).withMessage('Enter the 6-digit code from your authenticator app, or a backup code'),
];

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

const caretakerNameChain = (field, maxLength) =>
  body(field)
    .trim()
    .customSanitizer(toNameCase)
    .matches(new RegExp(`^(?=.{2,${maxLength}}$)(?=.*[A-Za-z].*[A-Za-z])[A-Za-z][A-Za-z ']+$`))
    .withMessage(`Name must contain 2-${maxLength} characters, including at least 2 letters, and use only letters, spaces and apostrophes`);

const createCaretakerValidators = [caretakerNameChain('firstName', 15), caretakerNameChain('lastName', 20), emailChain, phoneChain, buildServiceBarangayChain()];

// Landlords may update a caretaker's contact number and service area; the name and email are their identity and stay fixed.
const updateCaretakerValidators = [
  body(['firstName', 'lastName', 'fullName', 'email']).not().exists().withMessage("A caretaker's name and email cannot be changed"),
  buildPhoneChain().optional(),
  buildServiceBarangayChain().optional(),
];

// The activation code from the landlord (XXXXX-XXXXX); any case, the dash or a space optional.
const ACTIVATION_CODE = /^[A-Za-z0-9]{5}[-\s]?[A-Za-z0-9]{5}$/;
const ACTIVATION_CODE_MESSAGE = 'Enter the activation code from your landlord';
const activateCaretakerValidators = [
  emailChain,
  body('code').isString().withMessage(ACTIVATION_CODE_MESSAGE).bail().trim().matches(ACTIVATION_CODE).withMessage(ACTIVATION_CODE_MESSAGE),
  strongPasswordChain('password'),
];

// Recovery takes the same codes as a password reset.
const accountRecoveryValidators = [emailChain, resetCodeChain(), strongPasswordChain('newPassword')];

const currentPasswordChain = () => body('password').isString().withMessage('Enter your current password').bail().notEmpty().withMessage('Enter your current password').isLength({ max: 256 });
const mfaCodeChain = () => body('code').isString().withMessage(MFA_CODE_MESSAGE).bail().trim().matches(MFA_CODE).withMessage(MFA_CODE_MESSAGE);

const mfaSetupValidators = [currentPasswordChain()];
// Turning two-factor on needs a code from the app itself (never a backup code).
const mfaEnableValidators = [body('code').isString().bail().trim().matches(OTP).withMessage('Enter the 6-digit code from your authenticator app')];
// The code is optional here only for accounts still on the retired email method; MfaService requires
// a valid code from anyone enrolled with an authenticator app.
const mfaDisableValidators = [currentPasswordChain(), mfaCodeChain().optional()];
const mfaRecoveryCodesValidators = [currentPasswordChain(), mfaCodeChain()];
const mfaEmailEnableValidators = [body('code').isString().bail().trim().matches(OTP).withMessage('Enter the 6-digit code sent to your email')];
const mfaEmailResendValidators = [body('challengeToken').isString().bail().notEmpty().isLength({ max: 2048 })];

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
  mfaSetupValidators,
  mfaEnableValidators,
  mfaDisableValidators,
  mfaRecoveryCodesValidators,
  mfaEmailEnableValidators,
  mfaEmailResendValidators,
};
