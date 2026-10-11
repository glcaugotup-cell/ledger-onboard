const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const EmailService = require('./EmailService');
const ResetCodeService = require('./ResetCodeService');
const ApiError = require('../utils/ApiError');
const { hashPassword } = require('../utils/password');
const { ACCOUNT_STATUS } = require('../utils/constants');
const env = require('../config/env');

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'skipped' when EMAIL_TRANSPORT is none (nothing was sent), otherwise 'sent'. */
const emailStatusOf = (delivery) => (delivery?.skipped ? 'skipped' : 'sent');

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
    const delivery = await EmailService.sendArchiveWarningEmail(user.email, user.fullName, env.archiveDays - env.archiveWarningDays);
    await AuditLogRepository.record({
      action: 'ACCOUNT_ARCHIVE_WARNING_SENT',
      targetType: 'User',
      targetId: user._id,
      metadata: { email: user.email, emailStatus: emailStatusOf(delivery) },
    });
  }

  async _archiveUser(user) {
    await UserRepository.updateById(user._id, {
      accountStatus: ACCOUNT_STATUS.ARCHIVED,
      archivedAt: new Date(),
      archiveReason: 'INACTIVITY',
      refreshTokenHash: null,
      $inc: { tokenVersion: 1 }, // ends every session; recovery starts fresh
    });
    const delivery = await EmailService.sendArchivedNoticeEmail(user.email, user.fullName);
    await AuditLogRepository.record({
      action: 'ACCOUNT_ARCHIVED',
      targetType: 'User',
      targetId: user._id,
      metadata: { reason: 'INACTIVITY', emailStatus: emailStatusOf(delivery) },
    });
  }

  /**
   * Self-service recovery of an archived account. It needs the same proof as a password reset
   * (an admin reset code, an authenticator code or a backup code) and has its own failure counter
   * (accountRecovery.*). Unknown emails, accounts that aren't archived and wrong codes all get the
   * same generic error; an account that isn't archived never has its code checked, so no code
   * is used up.
   */
  async recoverArchivedAccount({ email, code, newPassword }) {
    const user = await UserRepository.findByEmail(email, { withSecrets: true });
    if (!user) throw ResetCodeService.invalidCode();
    // Checked for every existing account, so a lock never reveals which ones are archived.
    ResetCodeService.assertNotLocked(user, 'accountRecovery');

    const method = user.accountStatus === ACCOUNT_STATUS.ARCHIVED ? await ResetCodeService.match(user, code) : null;
    if (!method) {
      await ResetCodeService.recordFailure(user, 'accountRecovery');
      throw ResetCodeService.invalidCode();
    }

    const passwordHash = await hashPassword(newPassword);
    await UserRepository.updateById(user._id, {
      ...ResetCodeService.newPasswordUpdate(passwordHash, 'accountRecovery'),
      ...this.restoredFields(),
    });
    await this.recordRecovery(user, method);

    return { message: 'Account recovered. You can now log in with your new password.' };
  }

  /** The fields that bring an archived (or otherwise inactive) account back to active. */
  restoredFields() {
    return {
      accountStatus: ACCOUNT_STATUS.ACTIVE,
      archivedAt: null,
      archiveReason: null,
      archiveWarningSentAt: null,
      scheduledArchiveAt: null,
      lastActivityAt: new Date(),
    };
  }

  /** Written by account recovery and by a password reset that restored an archived account. */
  async recordRecovery(user, method) {
    await AuditLogRepository.record({
      action: 'ACCOUNT_RECOVERED',
      actorId: user._id,
      actorRole: user.role,
      targetType: 'User',
      targetId: user._id,
      metadata: { method },
    });
  }

  /** Admin override: reactivate any suspended/deactivated/archived account. */
  async adminReactivate(adminId, userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');

    await UserRepository.updateById(userId, this.restoredFields());

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
