const NotificationRepository = require('../repositories/NotificationRepository');
const UserRepository = require('../repositories/UserRepository');
const { ROLES, ACCOUNT_STATUS } = require('../utils/constants');

/**
 * In-app notifications. Other services call notify() when a workflow event
 * happens (reservation approved, payment verified, etc.).
 */
class NotificationService {
  async notify({ userId, type, title, message, relatedType = null, relatedId = null, link = null }) {
    return NotificationRepository.create({ userId, type, title, message, relatedType, relatedId, link });
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
