const NotificationRepository = require('../repositories/NotificationRepository');

/**
 * In-app notifications. Other services call notify() when a workflow event
 * happens (reservation approved, payment verified, etc.).
 */
class NotificationService {
  async notify({ userId, type, title, message, relatedType = null, relatedId = null }) {
    return NotificationRepository.create({ userId, type, title, message, relatedType, relatedId });
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
