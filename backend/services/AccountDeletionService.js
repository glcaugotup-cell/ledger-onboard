const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const NotificationRepository = require('../repositories/NotificationRepository');
const LandlordVerificationRepository = require('../repositories/LandlordVerificationRepository');
const StudentVerificationRepository = require('../repositories/StudentVerificationRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const ReservationRepository = require('../repositories/ReservationRepository');
const FileStorageService = require('./FileStorageService');
const EmailNotificationService = require('./EmailNotificationService');
const env = require('../config/env');
const { APP_TIME_ZONE } = require('../utils/dates');
const ApiError = require('../utils/ApiError');
const { unusablePasswordHash } = require('../utils/password');
const { ACCOUNT_STATUS, ACCOUNT_DELETION_GRACE_DAYS, RESERVATION_STATUS, ROLES } = require('../utils/constants');

const DAY_MS = 24 * 60 * 60 * 1000;
const longDate = new Intl.DateTimeFormat('en-PH', { timeZone: APP_TIME_ZONE, month: 'long', day: 'numeric', year: 'numeric' });
const OPEN_RESERVATIONS = [RESERVATION_STATUS.PENDING, RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.ACTIVE];
const CLOSED_STATUSES = [ACCOUNT_STATUS.PENDING_DELETION, ACCOUNT_STATUS.DELETED];

/**
 * The admin Archive. Archiving blocks the account and schedules it for erasure after
 * ACCOUNT_DELETION_GRACE_DAYS; restoring puts it back exactly as it was. Erasing wipes the
 * personal details and uploaded documents but keeps every bill, payment, reservation and
 * review, which then show as "Deleted user", so ledgers and reports stay correct.
 * Permission rules (who may archive whom) live in AdminService.
 */
class AccountDeletionService {
  isClosed(user) {
    return CLOSED_STATUSES.includes(user?.accountStatus);
  }

  /** Tenants and landlords with a pending, approved or current stay must finish it first. */
  async _assertNoOpenTenancy(user) {
    let open = 0;
    if (user.role === ROLES.TENANT) {
      open = await ReservationRepository.count({ tenantId: user._id, status: { $in: OPEN_RESERVATIONS } });
    } else if (user.role === ROLES.LANDLORD) {
      const properties = await PropertyRepository.findByLandlord(user._id);
      open = await ReservationRepository.count({ propertyId: { $in: properties.map((p) => p._id) }, status: { $in: OPEN_RESERVATIONS } });
    }
    if (open > 0) {
      throw ApiError.conflict('This account still has pending, approved or current reservations. Close them before archiving it.', 'ACCOUNT_HAS_OPEN_RESERVATIONS');
    }
  }

  async archive(actorId, user, reason, now = new Date()) {
    if (this.isClosed(user)) throw ApiError.conflict('This account is already in the archive.', 'ALREADY_ARCHIVED');
    await this._assertNoOpenTenancy(user);
    const scheduledFor = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * DAY_MS);
    const updated = await UserRepository.updateById(user._id, {
      accountStatus: ACCOUNT_STATUS.PENDING_DELETION,
      statusReason: reason.trim(),
      statusChangedAt: now,
      deletion: { requestedAt: now, requestedBy: actorId, scheduledFor, previousStatus: user.accountStatus },
      refreshTokenHash: null,
      $inc: { tokenVersion: 1 }, // signs the account out everywhere
    });
    await AuditLogRepository.record({
      action: 'ACCOUNT_MOVED_TO_ARCHIVE', actorId, actorRole: ROLES.ADMIN, targetType: 'User', targetId: user._id,
      metadata: { reason: reason.trim(), scheduledFor },
    });
    // Tell them why they can no longer sign in, and until when it can be undone.
    await EmailNotificationService.accountNotice(user, 'sendAccountClosedEmail', [
      user.firstName || user.fullName, { reason: reason.trim(), deleteOn: longDate.format(scheduledFor), contactEmail: env.mainAdminEmail },
    ]);
    return updated;
  }

  async restore(actorId, user, now = new Date()) {
    if (user.accountStatus !== ACCOUNT_STATUS.PENDING_DELETION) throw ApiError.conflict('This account is not in the archive.', 'NOT_ARCHIVED');
    const previous = user.deletion?.previousStatus;
    const status = Object.values(ACCOUNT_STATUS).includes(previous) && !CLOSED_STATUSES.includes(previous) ? previous : ACCOUNT_STATUS.ACTIVE;
    const updated = await UserRepository.updateById(user._id, {
      accountStatus: status,
      statusReason: null,
      statusChangedAt: now,
      deletion: { requestedAt: null, requestedBy: null, scheduledFor: null, previousStatus: null },
      // A fresh inactivity clock, so the lifecycle job does not archive it straight away.
      lastActivityAt: now,
    });
    await AuditLogRepository.record({
      action: 'ACCOUNT_RESTORED_FROM_ARCHIVE', actorId, actorRole: ROLES.ADMIN, targetType: 'User', targetId: user._id,
      metadata: { restoredStatus: status },
    });
    return updated;
  }

  /** actorId is null when the daily job erases an account whose grace period ended. */
  async erase(actorId, user, now = new Date()) {
    if (user.accountStatus !== ACCOUNT_STATUS.PENDING_DELETION) {
      throw ApiError.conflict('Only accounts in the archive can be deleted.', 'NOT_ARCHIVED');
    }
    // Last message to the address before it is erased.
    await EmailNotificationService.accountNotice(user, 'sendAccountDeletedEmail', [user.firstName || user.fullName, { contactEmail: env.mainAdminEmail }]);
    const verifications = await LandlordVerificationRepository.find({ landlordId: user._id });
    const studentIds = await StudentVerificationRepository.find({ tenantId: user._id });
    const files = [user.profilePhotoUrl, user.paymentQrUrl,
      ...verifications.flatMap((v) => [v.mayorBusinessPermitUrl, v.birForm2303Url]),
      ...studentIds.flatMap((v) => [v.idFrontUrl, v.idBackUrl])].filter(Boolean);

    // Straight to the collection: the email is immutable in the model, and freeing it lets the
    // person register again. Only this account's personal and sign-in data is touched.
    await UserRepository.model.collection.updateOne({ _id: user._id, accountStatus: ACCOUNT_STATUS.PENDING_DELETION }, {
      $set: {
        firstName: 'Deleted', lastName: 'User', fullName: 'Deleted user',
        email: `deleted-${user._id}@deleted.invalid`,
        passwordHash: await unusablePasswordHash(),
        accountStatus: ACCOUNT_STATUS.DELETED, statusReason: null, statusChangedAt: now, deletedAt: now,
        mfaEnabled: false, mfaMethod: 'none', emailMfaEnabledAt: null, emailConfirmedAt: null,
        'notificationPreferences.email': false, refreshTokenHash: null,
      },
      $unset: {
        phone: '', profilePhotoUrl: '', paymentQrUrl: '', emergencyContact: '', otp: '', emailCodes: '',
        mfaTotp: '', passwordReset: '', accountRecovery: '', privacyConsent: '', serviceBarangay: '', studentSchool: '', studentVerificationStatus: '', studentIdValidUntilYear: '',
      },
      $inc: { tokenVersion: 1 },
    });
    await NotificationRepository.model.deleteMany({ userId: user._id });
    await LandlordVerificationRepository.model.deleteMany({ landlordId: user._id });
    await StudentVerificationRepository.model.deleteMany({ tenantId: user._id });
    // Earlier audit entries keep what happened but no longer the person's email address.
    await AuditLogRepository.model.updateMany({ targetId: user._id, 'metadata.email': { $exists: true } }, { $unset: { 'metadata.email': '' } });
    await FileStorageService.deleteByUrls(files); // logs and skips any file it cannot remove
    await AuditLogRepository.record({
      action: 'ACCOUNT_DELETED', actorId, actorRole: actorId ? ROLES.ADMIN : null, targetType: 'User', targetId: user._id,
      metadata: { role: user.role, trigger: actorId ? 'main_admin' : 'grace_period_ended' },
    });
  }

  /** Daily: erase archived accounts whose grace period has ended. Returns how many were erased. */
  async purgeDue(now = new Date()) {
    const due = await UserRepository.find({ accountStatus: ACCOUNT_STATUS.PENDING_DELETION, 'deletion.scheduledFor': { $lte: now } });
    let deleted = 0;
    for (const user of due) {
      try {
        await this.erase(null, user, now);
        deleted += 1;
      } catch (err) {
        await AuditLogRepository.record({ action: 'ACCOUNT_DELETION_FAILED', targetType: 'User', targetId: user._id, success: false, metadata: { error: err.message } });
      }
    }
    return deleted;
  }
}

module.exports = new AccountDeletionService();
