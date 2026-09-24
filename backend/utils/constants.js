/** Shared enums used by models, services, validators and controllers. */

const ROLES = Object.freeze({
  TENANT: 'tenant',
  LANDLORD: 'landlord',
  CARETAKER: 'caretaker',
  ADMIN: 'admin',
});

const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  PENDING_ACTIVATION: 'pending_activation',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
  ARCHIVED: 'archived',
});

const MFA_METHOD = Object.freeze({
  NONE: 'none',
  EMAIL: 'email',
  AUTHENTICATOR: 'authenticator',
});

const LISTING_STATUS = Object.freeze({
  DRAFT: 'draft',
  PENDING_MODERATION: 'pending_moderation',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  INACTIVE: 'inactive',
});

const PROPERTY_TYPE = Object.freeze({
  ROOM_ONLY: 'Room Only',
  APARTMENT: 'Apartment',
  BEDSPACE: 'Bedspace',
  STUDIO: 'Studio',
});

const GENDER_POLICY = Object.freeze({
  FEMALE_ONLY: 'Female Only',
  MALE_ONLY: 'Male Only',
  CO_ED: 'Co-Ed',
});

const ROOM_STATUS = Object.freeze({
  AVAILABLE: 'available',
  OCCUPIED: 'occupied',
  MAINTENANCE: 'maintenance',
});

const RESERVATION_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

// Allowed reservation status transitions.
const RESERVATION_TRANSITIONS = Object.freeze({
  [RESERVATION_STATUS.PENDING]: [RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.REJECTED, RESERVATION_STATUS.CANCELLED],
  [RESERVATION_STATUS.APPROVED]: [RESERVATION_STATUS.COMPLETED, RESERVATION_STATUS.CANCELLED],
  [RESERVATION_STATUS.REJECTED]: [],
  [RESERVATION_STATUS.CANCELLED]: [],
  [RESERVATION_STATUS.COMPLETED]: [],
});

const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'UNPAID',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
});

const PAYMENT_METHOD = Object.freeze({
  GCASH_SCREENSHOT: 'GCASH_SCREENSHOT',
  CASH_ON_SITE: 'CASH_ON_SITE',
});

const VERIFICATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
});

const REVIEW_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  HIDDEN: 'HIDDEN',
});

module.exports = {
  ROLES,
  ACCOUNT_STATUS,
  MFA_METHOD,
  LISTING_STATUS,
  PROPERTY_TYPE,
  GENDER_POLICY,
  ROOM_STATUS,
  RESERVATION_STATUS,
  RESERVATION_TRANSITIONS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  VERIFICATION_STATUS,
  REVIEW_STATUS,
};
