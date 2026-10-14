const NotificationRepository = require('../repositories/NotificationRepository');
const UserRepository = require('../repositories/UserRepository');
const EmailNotificationService = require('./EmailNotificationService');
const { ROLES, ACCOUNT_STATUS } = require('../utils/constants');
const { verifyUnsubscribeToken } = require('../utils/unsubscribe');
const { categoryOfNotification } = require('../utils/emailCategories');

// Important events that are also emailed as a copy of the notification. Everything else stays
// in-app only, keeping email volume low so it is less likely to be treated as spam. Reservation
// approvals, payment results, bill reminders and business verification results are not listed:
// the services that raise them send their own, more detailed email.
const EMAILED_TYPES = new Set([
  'RESERVATION_REQUESTED', 'RESERVATION_REJECTED', 'RESERVATION_CANCELLED', 'RESERVATION_AUTO_CANCELLED', 'RESERVATION_NO_SHOW',
  'LEAVE_REQUESTED', 'LEAVE_APPROVED', 'LEAVE_DECLINED',
  'BILL_CREATED', 'PAYMENT_SUBMITTED', 'PROPERTY_ASSIGNED',
]);
const NO_EMAIL_STATUSES = new Set([ACCOUNT_STATUS.DEACTIVATED, ACCOUNT_STATUS.ARCHIVED, ACCOUNT_STATUS.PENDING_DELETION, ACCOUNT_STATUS.DELETED]);

/**
 * In-app notifications; important ones are also emailed to a confirmed inbox unless the
 * user turned email off. Other services call notify() when a workflow event happens
 * (reservation approved, payment verified, etc.).
 */
class NotificationService {
  /** `email: false` keeps an otherwise emailed type in-app only (e.g. payments on a past stay's bills). */
  async notify({ userId, type, title, message, relatedType = null, relatedId = null, link = null, email = true }) {
    const notification = await NotificationRepository.create({ userId, type, title, message, relatedType, relatedId, link });
    if (email && EMAILED_TYPES.has(type)) await this._email(userId, { title, message, link }, categoryOfNotification(type));
    return notification;
  }

  async _email(userId, { title, message, link }, category) {
    // The in-app notification is saved; email trouble must never fail the workflow that raised it.
    try {
      const user = await UserRepository.findById(userId);
      if (!user || NO_EMAIL_STATUSES.has(user.accountStatus)) return;
      await EmailNotificationService.deliver(user, 'sendNotificationEmail', [user.firstName || user.fullName, { title, message, link }], { category });
    } catch (err) {
      console.error('[NotificationService] notification email failed:', err.message);
    }
  }

  verifyUnsubscribeLink(userId, token) {
    return verifyUnsubscribeToken(userId, token);
  }

  /** Turns routine email off from a signed unsubscribe link; false when the link is not genuine. */
  async unsubscribeEmail(userId, token) {
    if (!verifyUnsubscribeToken(userId, token)) return false;
    await UserRepository.updateById(userId, { 'notificationPreferences.email': false });
    return true;
  }

  async notifyAdmins(notification) {
    const admins = await UserRepository.findByRole(ROLES.ADMIN, { filter: { accountStatus: ACCOUNT_STATUS.ACTIVE } });
    // A failed delivery to one admin must not prevent the others from receiving it.
    const results = await Promise.allSettled(admins.map(admin => this.notify({ ...notification, userId: admin._id })));
    if (results.some(result => result.status === 'rejected')) {
      console.warn('[NotificationService] Some admin notifications could not be saved.');
    }
  }

  async listForUser(userId, { onlyUnread, skip, limit } = {}) {
    return NotificationRepository.findByUser(userId, { onlyUnread, skip, limit });
  }

  async unreadCount(userId) {
    return NotificationRepository.countUnread(userId);
  }

  async markRead(notificationId, userId) {
    const updated = await NotificationRepository.markRead(notificationId, userId);
    if (!updated) {
      const ApiError = require('../utils/ApiError');
      throw ApiError.notFound('Notification not found', 'NOTIFICATION_NOT_FOUND');
    }
    return updated;
  }

  async markAllRead(userId) {
    return NotificationRepository.markAllRead(userId);
  }
}

module.exports = new NotificationService();
