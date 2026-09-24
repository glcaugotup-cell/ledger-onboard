const mongoose = require('mongoose');
const { ROLES, ACCOUNT_STATUS, MFA_METHOD, VERIFICATION_STATUS } = require('../utils/constants');

const { Schema } = mongoose;

const GMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
const PH_PHONE_REGEX = /^(09\d{9}|\+639\d{9})$/;
// Min 2 chars, starts uppercase, letters/spaces/hyphens/periods only.
const NAME_REGEX = /^[A-Z][a-zA-Z\s.-]{1,}$/;

const userSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      match: [NAME_REGEX, 'First name must start with an uppercase letter and contain only letters, spaces, hyphens, or periods'],
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      match: [NAME_REGEX, 'Last name must start with an uppercase letter and contain only letters, spaces, hyphens, or periods'],
    },
    // Derived from firstName + lastName by the service layer; stored because it's read widely.
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      immutable: true, // cannot be changed by the user post-registration
      match: [GMAIL_REGEX, 'Email must be a valid @gmail.com address'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default queries
    },
    phone: {
      type: String,
      trim: true,
      match: [PH_PHONE_REGEX, 'Phone must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)'],
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true,
      default: ROLES.TENANT,
    },
    assignedLandlordId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByLandlordId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    accountStatus: {
      type: String,
      enum: Object.values(ACCOUNT_STATUS),
      default: ACCOUNT_STATUS.ACTIVE,
    },
    mfaEnabled: {
      type: Boolean,
      default: false,
    },
    mfaMethod: {
      type: String,
      enum: Object.values(MFA_METHOD),
      default: MFA_METHOD.NONE,
    },
    // Registration email verification (separate from caretaker PENDING_ACTIVATION).
    // Only AuthService.register() sets this to false.
    emailVerified: { type: Boolean, default: true },
    // Landlords only: mirrors the latest LandlordVerification submission (null if none yet).
    businessVerificationStatus: {
      type: String,
      enum: Object.values(VERIFICATION_STATUS),
      default: null,
    },
    // One-time-password state for login-MFA, forgot-password, and
    // registration email-verification flows.
    otp: {
      codeHash: { type: String, select: false, default: null },
      purpose: { type: String, enum: ['login_mfa', 'password_reset', 'email_verification', null], default: null, select: false },
      expiresAt: { type: Date, select: false, default: null },
      attempts: { type: Number, default: 0, select: false },
    },
    // Hash of the current valid refresh token, so logout/rotation can
    // revoke it server-side instead of relying purely on JWT expiry.
    refreshTokenHash: { type: String, select: false, default: null },
    lastLoginAt: { type: Date, default: null },
    lastActivityAt: { type: Date, default: Date.now },
    archiveWarningSentAt: { type: Date, default: null },
    scheduledArchiveAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    archiveReason: { type: String, default: null },
    profilePhotoUrl: { type: String, default: null },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      inApp: { type: Boolean, default: true },
    },
    // Privacy Policy consent captured at registration; `at` records when it was given.
    privacyConsent: {
      given: { type: Boolean, default: false },
      at: { type: Date, default: null },
    },
    // Tenants only: someone the landlord or caretaker can reach in an emergency.
    emergencyContact: {
      name: {
        type: String,
        trim: true,
        match: [NAME_REGEX, 'Emergency contact name must start with an uppercase letter and contain only letters, spaces, hyphens, or periods'],
      },
      phone: {
        type: String,
        trim: true,
        match: [PH_PHONE_REGEX, 'Emergency contact phone must be a valid Philippine mobile number (09XXXXXXXXX or +639XXXXXXXXX)'],
      },
    },
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });
userSchema.index({ assignedLandlordId: 1 });
userSchema.index({ accountStatus: 1, lastActivityAt: 1 }); // for the lifecycle sweep

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
