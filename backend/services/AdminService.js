const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const ApiError = require('../utils/ApiError');
const { ACCOUNT_STATUS } = require('../utils/constants');

const ADMIN_SETTABLE_STATUSES = new Set([
  ACCOUNT_STATUS.ACTIVE,
  ACCOUNT_STATUS.SUSPENDED,
  ACCOUNT_STATUS.DEACTIVATED,
]);

class AdminService {
  async listUsers({ role, accountStatus, skip, limit } = {}) {
    const filter = {};
    if (role) filter.role = role;
    if (accountStatus) filter.accountStatus = accountStatus;
    return UserRepository.find(filter, { sort: { createdAt: -1 }, skip, limit });
  }

  async listAuditLogs(filters) {
    return AuditLogRepository.findRecent(filters);
  }

  /** Suspend / deactivate / reactivate. Archive recovery has its own dedicated flow (AccountLifecycleService). */
  async setUserStatus(adminId, userId, status, reason) {
    if (!ADMIN_SETTABLE_STATUSES.has(status)) {
      throw ApiError.badRequest('Invalid account status for this action', 'INVALID_STATUS');
    }
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    if (user.role === 'admin') {
      throw ApiError.forbidden('Admin accounts cannot be modified through this endpoint', 'CANNOT_MODIFY_ADMIN');
    }

    const updates = { accountStatus: status };
    if (status !== ACCOUNT_STATUS.ACTIVE) updates.refreshTokenHash = null;
    if (status === ACCOUNT_STATUS.ACTIVE) {
      updates.archivedAt = null;
      updates.archiveReason = null;
      updates.archiveWarningSentAt = null;
      updates.scheduledArchiveAt = null;
      updates.lastActivityAt = new Date();
    }

    const updated = await UserRepository.updateById(userId, updates);

    await AuditLogRepository.record({
      action: `ACCOUNT_STATUS_SET_${status.toUpperCase()}`,
      actorId: adminId,
      actorRole: 'admin',
      targetType: 'User',
      targetId: userId,
      metadata: { reason: reason || null },
    });

    return updated;
  }
}

module.exports = new AdminService();
