const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const ApiError = require('../utils/ApiError');
const { hashOtp } = require('../utils/otp');
const { unusablePasswordHash } = require('../utils/password');
const { deriveFullName } = require('../utils/name');
const { isMainAdmin } = require('../utils/mainAdmin');
const { randomCode, normalizeCode } = require('../utils/oneTimeCodes');
const { ACCOUNT_STATUS, PASSWORD_RESET_CODE, ROLES } = require('../utils/constants');

const ADMIN_SETTABLE_STATUSES = new Set([
  ACCOUNT_STATUS.ACTIVE,
  ACCOUNT_STATUS.SUSPENDED,
  ACCOUNT_STATUS.DEACTIVATED,
]);

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days without activity before an admin may deactivate an account for inactivity. */
const INACTIVITY_DEACTIVATION_DAYS = 60;

class AdminService {
  /**
   * Loads the target of an admin action. Admin accounts can only be managed by the main admin,
   * and the main admin by no one, so the platform can never lose its last way in.
   */
  async _loadManageable(actorId, userId) {
    const user = await UserRepository.findById(userId);
    if (!user) throw ApiError.notFound('User not found', 'USER_NOT_FOUND');
    if (isMainAdmin(user)) throw ApiError.forbidden('The main admin account cannot be changed here.', 'CANNOT_MODIFY_MAIN_ADMIN');
    if (user.role === ROLES.ADMIN && !isMainAdmin(await UserRepository.findById(actorId))) {
      throw ApiError.forbidden('Only the main admin can manage admin accounts', 'CANNOT_MODIFY_ADMIN');
    }
    return user;
  }

  /**
   * Main admin only: adds another admin. No password is set; the main admin gets a one-time
   * setup code (the same 30-minute code as a password reset) to hand over in person, and the new
   * admin uses it on the reset-password page to choose their own password.
   */
  async createAdmin(actorId, { firstName, lastName, email, phone }) {
    if (!isMainAdmin(await UserRepository.findById(actorId))) {
      throw ApiError.forbidden('Only the main admin can add admins', 'MAIN_ADMIN_REQUIRED');
    }
    if (await UserRepository.findByEmail(email)) throw ApiError.conflict('An account with this email already exists', 'ACCOUNT_EXISTS');
    const admin = await UserRepository.create({
      firstName, lastName, fullName: deriveFullName(firstName, lastName), email, phone,
      passwordHash: await unusablePasswordHash(), role: ROLES.ADMIN,
    });
    const { code, expiresAt } = await this._issueResetCode(admin._id);
    await AuditLogRepository.record({
      action: 'ADMIN_CREATED', actorId, actorRole: ROLES.ADMIN, targetType: 'User', targetId: admin._id,
      metadata: { email: admin.email, expiresAt },
    });
    return { user: admin, code, expiresAt };
  }

  async _issueResetCode(userId) {
    const code = randomCode(PASSWORD_RESET_CODE.LENGTH, 4);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_CODE.TTL_MINUTES * 60 * 1000);
    await UserRepository.updateById(userId, {
      otp: { codeHash: await hashOtp(normalizeCode(code)), purpose: 'password_reset', expiresAt, attempts: 0 },
    });
    return { code, expiresAt };
  }

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
    const user = await this._loadManageable(adminId, userId);
    // Activation is the caretaker's own step (it sets their password); an admin can't skip it.
    if (user.accountStatus === ACCOUNT_STATUS.PENDING_ACTIVATION && status === ACCOUNT_STATUS.ACTIVE) {
      throw ApiError.badRequest(
        'This caretaker has not activated their account yet. Their landlord must give them an activation code, and they activate the account themselves.',
        'ACCOUNT_NOT_ACTIVATED',
      );
    }

    const updates = { accountStatus: status, statusChangedAt: new Date(), statusReason: status === ACCOUNT_STATUS.ACTIVE ? null : reason.trim() };
    if (status !== ACCOUNT_STATUS.ACTIVE) {
      updates.refreshTokenHash = null;
      // Ends every session, so a later reactivation doesn't bring old ones back.
      updates.$inc = { tokenVersion: 1 };
    }
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
   * One-time password reset code for someone who can't use an authenticator or backup code.
   * The admin hands it over after confirming who they are; it is returned only here, stored only
   * as a bcrypt hash (in the shared OTP slot, replacing anything pending there), lasts 30 minutes
   * and works once. The audit entry never contains the code.
   */
  async issuePasswordResetCode(adminId, userId) {
    const user = await this._loadManageable(adminId, userId);
    if (user.accountStatus === ACCOUNT_STATUS.PENDING_ACTIVATION) {
      throw ApiError.badRequest('This caretaker has not activated their account yet. Their landlord can give them a new activation code.', 'ACCOUNT_NOT_ACTIVATED');
    }

    const { code, expiresAt } = await this._issueResetCode(userId);
    await AuditLogRepository.record({
      action: 'PASSWORD_RESET_CODE_ISSUED',
      actorId: adminId,
      actorRole: 'admin',
      targetType: 'User',
      targetId: userId,
      metadata: { expiresAt },
    });
    return { code, expiresAt };
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
    const user = await this._loadManageable(adminId, userId);
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
      $inc: { tokenVersion: 1 },
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
