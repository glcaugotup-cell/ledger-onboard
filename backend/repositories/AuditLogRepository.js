const BaseRepository = require('./BaseRepository');
const AuditLog = require('../models/AuditLog');

class AuditLogRepository extends BaseRepository {
  constructor() {
    super(AuditLog);
  }

  record({ action, actorId = null, actorRole = null, targetType = null, targetId = null, metadata = {}, success = true }) {
    // Fire-and-forget from the caller's perspective is tempting, but audit
    // entries are compliance-relevant, so callers await this.
    return this.model.create({ action, actorId, actorRole, targetType, targetId, metadata, success });
  }

  findRecent({ action, actorId, targetType, skip = 0, limit = 50 } = {}) {
    const filter = {};
    if (action) filter.action = action;
    if (actorId) filter.actorId = actorId;
    if (targetType) filter.targetType = targetType;
    return this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
  }
}

module.exports = new AuditLogRepository();
