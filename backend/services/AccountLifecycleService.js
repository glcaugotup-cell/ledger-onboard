const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const EmailService = require('./EmailService');
const ApiError = require('../utils/ApiError');
const { hashPassword } = require('../utils/password');
const { ACCOUNT_STATUS } = require('../utils/constants');
const env = require('../config/env');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Account inactivity lifecycle:
 *  - Day 25 of inactivity -> warning email, archiveWarningSentAt set.
 *  - Any qualifying activity before day 30 -> resets the timer.
 *  - Day 30 -> ARCHIVED (never hard-deleted; history stays referenced).
 * AccountLifecycleJob calls runDailySweep() at least once a day.
 */
class AccountLifecycleService {
  /** Called on qualifying authenticated actions (not passive notification polling). */
  async recordActivity(userId) {
    const now = new Date();
    await UserRepository.updateById(userId, {
      lastActivityAt: now,
      archiveWarningSentAt: null,
      scheduledArchiveAt: null,
    });
  }

  async runDailySweep() {
    const now = new Date();
    const warningCutoff = new Date(now.getTime() - env.archiveWarningDays * DAY_MS);
    const archiveCutoff = new Date(now.getTime() - env.archiveDays * DAY_MS);

    const results = { warned: 0, archived: 0, failed: 0 };

    // Day 30: archive anyone whose last activity crossed the archive threshold.
    const toArchive = await UserRepository.findActiveOlderThan(archiveCutoff);
    for (const user of toArchive) {
      try {
        await this._archiveUser(user);
        results.archived += 1;
      } catch (err) {
        results.failed += 1;
        await AuditLogRepository.record({
          action: 'ACCOUNT_LIFECYCLE_ARCHIVE_FAILED',
          targetType: 'User',
          targetId: user._id,
          success: false,
          metadata: { error: err.message },
        });
      }
    }

    // Day 25: warn anyone past the warning threshold but not yet archived,
    // who hasn't already been warned this cycle.
    const candidates = await UserRepository.findActiveOlderThan(warningCutoff);
    for (const user of candidates) {
      if (user.archiveWarningSentAt) continue; // already warned, awaiting day 30 or a reset
      if (user.lastActivityAt <= archiveCutoff) continue; // handled by the archive pass above
      try {
        await this._warnUser(user, now);
        results.warned += 1;
      } catch (err) {
        results.failed += 1;
        await AuditLogRepository.record({
          action: 'ACCOUNT_LIFECYCLE_WARNING_FAILED',
          targetType: 'User',
          targetId: user._id,
          success: false,
          metadata: { error: err.message },
        });
      }
    }

    await AuditLogRepository.record({
      action: 'ACCOUNT_LIFECYCLE_SWEEP_COMPLETED',
      metadata: results,
    });

    return results;
  }

  async _warnUser(user, now) {
    const scheduledArchiveAt = new Date(now.getTime() + (env.archiveDays - env.archiveWarningDays) * DAY_MS);
    await UserRepository.updateById(user._id, {
      archiveWarningSentAt: now,
      scheduledArchiveAt,
    });
    await EmailService.sendArchiveWarningEmail(user.email, user.fullName, env.archiveDays - env.archiveWarningDays);
    await AuditLogRepository.record({
      action: 'ACCOUNT_ARCHIVE_WARNING_SENT',
      targetType: 'User',
      targetId: user._id,
      metadata: { email: user.email },
    });
  }

  async _archiveUser(user) {
    await UserRepository.updateById(user._id, {
      accountStatus: ACCOUNT_STATUS.ARCHIVED,
      archivedAt: new Date(),
      archiveReason: 'INACTIVITY',
      refreshTokenHash: null,
    });
    await EmailService.sendArchivedNoticeEmail(user.email, user.fullName);
    await AuditLogRepository.record({
      action: 'ACCOUNT_ARCHIVED',
      targetType: 'User',
      targetId: user._id,
      metadata: { reason: 'INACTIVITY' },
    });
  }

  /** Recovery for archived accounts, tied to the registered email. */
  async recoverArchivedAccount({ email, newPassword }) {
    const user = await UserRepository.findByEmail(email);
    if (!user || user.accountStatus !== ACCOUNT_STATUS.ARCHIVED) {
      // Do not confirm/deny account existence/state to an unauthenticated caller.
      throw ApiError.badRequest('Unable to process recovery request', 'RECOVERY_NOT_AVAILABLE');
    }

    const passwordHash = await hashPassword(newPassword);
    await UserRepository.updateById(user._id, {
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      archivedAt: null,
      archiveReason: null,
      archiveWarningSentAt: null,
      scheduledArchiveAt: null,
      lastActivityAt: new Date(),
      passwordHash,
    });

    await AuditLogRepository.record({
      action: 'ACCOUNT_RECOVERED',
      targetType: 'User',
      targetId: user._id,
    });

    return { message: 'Account recovered. You can now log in with your new password.' };
  }

  /** Admin override: reactivate any suspended/deactivated/archived account. */
  async adminReactivate(adminId, userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

    await UserRepository.updateById(userId, {
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      archivedAt: null,
      archiveReason: null,
      archiveWarningSentAt: null,
      scheduledArchiveAt: null,
      lastActivityAt: new Date(),
    });

    await AuditLogRepository.record({
      action: 'ACCOUNT_REACTIVATED_BY_ADMIN',
      actorId: adminId,
      actorRole: 'admin',
      targetType: 'User',
      targetId: userId,
    });

    return { message: 'Account reactivated.' };
  }
}

module.exports = new AccountLifecycleService();
