const NotificationRepository = require('../repositories/NotificationRepository');
const UserRepository = require('../repositories/UserRepository');
const EmailNotificationService = require('./EmailNotificationService');
const { ROLES, ACCOUNT_STATUS } = require('../utils/constants');

// These events already send their own, more detailed email from the service that raises them.
const DEDICATED_EMAIL_TYPES = new Set([
  'RESERVATION_APPROVED', 'PAYMENT_VERIFIED', 'PAYMENT_REJECTED',
  'BUSINESS_VERIFICATION_APPROVED', 'BUSINESS_VERIFICATION_REJECTED',
  'BILL_DUE_IN_7_DAYS', 'BILL_DUE_IN_3_DAYS',
]);
const NO_EMAIL_STATUSES = new Set([ACCOUNT_STATUS.DEACTIVATED, ACCOUNT_STATUS.ARCHIVED]);

/**
 * In-app notifications, each also emailed to a confirmed inbox unless the user
 * turned email off. Other services call notify() when a workflow event happens
 * (reservation approved, payment verified, etc.).
 */
class NotificationService {
  async notify({ userId, type, title, message, relatedType = null, relatedId = null, link = null }) {
    const notification = await NotificationRepository.create({ userId, type, title, message, relatedType, relatedId, link });
    if (!DEDICATED_EMAIL_TYPES.has(type)) await this._email(userId, { title, message, link });
    return notification;
  }

  async _email(userId, { title, message, link }) {
    // The in-app notification is saved; email trouble must never fail the workflow that raised it.
    try {
      const user = await UserRepository.findById(userId);
      if (!user || NO_EMAIL_STATUSES.has(user.accountStatus)) return;
      await EmailNotificationService.deliver(user, 'sendNotificationEmail', [user.firstName || user.fullName, { title, message, link }]);
    } catch (err) {
      console.error('[NotificationService] notification email failed:', err.message);
    }
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
