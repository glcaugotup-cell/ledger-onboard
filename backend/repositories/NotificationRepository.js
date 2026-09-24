const BaseRepository = require('./BaseRepository');
const Notification = require('../models/Notification');

class NotificationRepository extends BaseRepository {
  constructor() {
    super(Notification);
  }

  findByUser(userId, { onlyUnread = false, skip = 0, limit = 50 } = {}) {
    const filter = { userId };
    if (onlyUnread) filter.read = false;
    return this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
  }

  markRead(id, userId) {
    return this.model.findOneAndUpdate({ _id: id, userId }, { read: true }, { new: true }).exec();
  }

  markAllRead(userId) {
    return this.model.updateMany({ userId, read: false }, { read: true }).exec();
  }

  countUnread(userId) {
    return this.model.countDocuments({ userId, read: false });
  }
}

module.exports = new NotificationRepository();
