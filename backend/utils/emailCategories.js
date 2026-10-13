/**
 * Email notification categories a user can tick on or off in Profile. Every category is on by
 * default (a missing value counts as on). Security notices and sign-in codes are not listed:
 * they always send. The frontend shows the same keys (EmailNotificationSettings).
 */
const EMAIL_CATEGORIES = Object.freeze(['reservations', 'bills', 'payments', 'verification', 'assignments', 'account']);

/** Which categories each role can receive (others never apply to them). */
const ROLE_EMAIL_CATEGORIES = Object.freeze({
  tenant: ['reservations', 'bills', 'payments', 'account'],
  landlord: ['reservations', 'payments', 'verification', 'account'],
  caretaker: ['assignments', 'account'],
  admin: [],
});

/** Category of an emailed in-app notification type. */
function categoryOfNotification(type) {
  if (/^(RESERVATION|LEAVE)_/.test(type)) return 'reservations';
  if (/^BILL_/.test(type)) return 'bills';
  if (/^PAYMENT_/.test(type)) return 'payments';
  if (/^BUSINESS_VERIFICATION_/.test(type)) return 'verification';
  if (type === 'PROPERTY_ASSIGNED') return 'assignments';
  return null;
}

module.exports = { EMAIL_CATEGORIES, ROLE_EMAIL_CATEGORIES, categoryOfNotification };
