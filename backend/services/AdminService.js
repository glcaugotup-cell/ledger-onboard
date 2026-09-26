const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const ApiError = require('../utils/ApiError');
const { ACCOUNT_STATUS } = require('../utils/constants');

const ADMIN_SETTABLE_STATUSES = new Set([
  ACCOUNT_STATUS.ACTIVE,
  ACCOUNT_STATUS.SUSPENDED,
  ACCOUNT_STATUS.DEACTIVATED,
]);

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days without activity before an admin may deactivate an account for inactivity. */
const INACTIVITY_DEACTIVATION_DAYS = 60;

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
    if (status !== ACCOUNT_STATUS.ACTIVE && !reason?.trim()) {
      throw ApiError.badRequest('A reason is required to suspend or deactivate an account', 'REASON_REQUIRED');
    }
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    if (user.role === 'admin') {
      throw ApiError.forbidden('Admin accounts cannot be modified through this endpoint', 'CANNOT_MODIFY_ADMIN');
    }

    const updates = { accountStatus: status, statusChangedAt: new Date(), statusReason: status === ACCOUNT_STATUS.ACTIVE ? null : reason.trim() };
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

  /**
   * Admin-initiated deactivation of an account with no activity for 60+ days.
   * Never automatic, and separate from the automatic lifecycle (day-25 warning,
   * day-30 archive, which the user can undo through account recovery): it applies
   * to accounts that are still active (the daily sweep never caught them, e.g. while
   * the server was asleep) or already archived, and moves them to DEACTIVATED, which
   * blocks login and self-recovery until an admin reactivates them. Only the status
   * changes; none of the user's history is touched.
   */
  async deactivateForInactivity(adminId, userId, reason, now = new Date()) {
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    if (user.role === 'admin') {
      throw ApiError.forbidden('Admin accounts cannot be modified through this endpoint', 'CANNOT_MODIFY_ADMIN');
    }
    if (![ACCOUNT_STATUS.ACTIVE, ACCOUNT_STATUS.ARCHIVED].includes(user.accountStatus)) {
      throw ApiError.conflict(`This account is already ${user.accountStatus.replace('_', ' ')}.`, 'NOT_ELIGIBLE_FOR_INACTIVITY_DEACTIVATION');
    }

    const lastActive = user.lastActivityAt || user.createdAt;
    const daysInactive = Math.floor((now.getTime() - new Date(lastActive).getTime()) / DAY_MS);
    if (daysInactive < INACTIVITY_DEACTIVATION_DAYS) {
      throw ApiError.conflict(
        `This account was active ${daysInactive} day${daysInactive === 1 ? '' : 's'} ago. Inactivity deactivation is only available after ${INACTIVITY_DEACTIVATION_DAYS} days.`,
        'NOT_INACTIVE_LONG_ENOUGH'
      );
    }

    const updated = await UserRepository.updateById(userId, {
      accountStatus: ACCOUNT_STATUS.DEACTIVATED,
      statusReason: `Inactive for ${daysInactive} days: ${reason.trim()}`,
      statusChangedAt: now,
      refreshTokenHash: null,
    });

    await AuditLogRepository.record({
      action: 'ACCOUNT_DEACTIVATED_FOR_INACTIVITY',
      actorId: adminId,
      actorRole: 'admin',
      targetType: 'User',
      targetId: userId,
      metadata: { reason: reason.trim(), daysInactive, previousStatus: user.accountStatus },
    });

    return updated;
  }
}

module.exports = new AdminService();
module.exports.INACTIVITY_DEACTIVATION_DAYS = INACTIVITY_DEACTIVATION_DAYS;
