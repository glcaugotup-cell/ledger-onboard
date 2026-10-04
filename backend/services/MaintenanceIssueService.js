const IssueRepository = require('../repositories/MaintenanceIssueRepository');
const ReservationRepository = require('../repositories/ReservationRepository');
const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const FileStorageService = require('./FileStorageService');
const NotificationService = require('./NotificationService');
const ApiError = require('../utils/ApiError');
const { appDateKey, inputDateKey } = require('../utils/dates');
const { ROLES, RESERVATION_STATUS, MAINTENANCE_STATUS } = require('../utils/constants');

const CATEGORIES = ['Plumbing', 'Electrical', 'Appliance', 'Structural', 'Pest control', 'Cleaning', 'Other'];
const OPEN_FOR_WORK = [MAINTENANCE_STATUS.PENDING, MAINTENANCE_STATUS.IN_PROGRESS];

const issueLink = {
  [ROLES.TENANT]: (id) => `/tenant/apartment?tab=issues&issue=${id}`,
  [ROLES.LANDLORD]: (id) => `/landlord/issues?issue=${id}`,
  [ROLES.CARETAKER]: (id) => `/caretaker/issues?issue=${id}`,
};

const historyEntry = (status, event, requester, note = '') => ({
  status, event, at: new Date(), byRole: requester?.role || null, by: requester?.id || null, note,
});

const reasonOrThrow = (value, message, code) => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length < 3 || trimmed.length > 2000) throw ApiError.badRequest(message, code);
  return trimmed;
};

class MaintenanceIssueService {
  /**
   * Each role's list. `archived` switches to that role's Archive: the tenant's archived issues,
   * the landlord's removed reports, or the caretaker's personally archived tasks.
   */
  async list(requester, { archived = false } = {}) {
    let filter;
    if (requester.role === ROLES.TENANT) {
      filter = { tenantId: requester.id, tenantArchivedAt: archived ? { $ne: null } : null };
    } else if (requester.role === ROLES.LANDLORD) {
      filter = { landlordId: requester.id, removedAt: archived ? { $ne: null } : null };
    } else {
      filter = archived
        ? { caretakerId: requester.id, caretakerArchivedAt: { $ne: null } }
        : { caretakerId: requester.id, caretakerArchivedAt: null, removedAt: null };
    }
    return IssueRepository.find(filter, { populate: 'tenantId landlordId caretakerId roomId propertyId', sort: { createdAt: -1 } });
  }

  async create(tenantId, data, files = []) {
    if (!CATEGORIES.includes(data.category)) throw ApiError.badRequest('Choose a valid issue category.', 'INVALID_ISSUE_CATEGORY');
    const reservation = await ReservationRepository.findById(data.reservationId, { populate: 'roomId propertyId' });
    // Reports are only for a current stay (after the landlord confirms the move-in).
    if (!reservation || String(reservation.tenantId) !== String(tenantId) || reservation.status !== RESERVATION_STATUS.ACTIVE) {
      throw ApiError.badRequest('You can report issues only for your current stay, after the landlord confirms your move-in.', 'ACTIVE_TENANCY_REQUIRED');
    }
    const urls = await FileStorageService.saveUploads(files, 'issue-photos');
    try {
      const issue = await IssueRepository.create({
        tenantId,
        landlordId: reservation.propertyId.landlordId,
        reservationId: reservation._id,
        propertyId: reservation.propertyId._id,
        roomId: reservation.roomId._id,
        category: data.category,
        urgency: data.urgency,
        description: data.description,
        photos: urls,
        statusHistory: [historyEntry(MAINTENANCE_STATUS.PENDING, 'reported', { role: ROLES.TENANT, id: tenantId })],
      });
      await NotificationService.notify({ userId: reservation.propertyId.landlordId, type: 'MAINTENANCE_ISSUE_CREATED', title: 'New maintenance issue', message: `${data.urgency} priority ${data.category} issue reported for ${reservation.propertyId.propertyName}, Room ${reservation.roomId.roomNumber}.`, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.LANDLORD](issue._id) }).catch(() => {});
      return issue;
    } catch (err) {
      await FileStorageService.deleteByUrls(urls);
      throw err;
    }
  }

  async assign(issueId, landlordId, { caretakerId, internalNotes, targetDate, landlordUpdate }) {
    const issue = await IssueRepository.findOne({ _id: issueId, landlordId });
    if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
    this._assertNotRemoved(issue);
    if (!OPEN_FOR_WORK.includes(issue.status)) throw ApiError.badRequest('Only open issues can be assigned.', 'ISSUE_NOT_OPEN');
    if (!targetDate) throw ApiError.badRequest('Choose a target resolution date.', 'TARGET_DATE_REQUIRED');
    if (inputDateKey(targetDate) < appDateKey()) throw ApiError.badRequest('The target resolution date cannot be in the past.', 'TARGET_DATE_IN_PAST');
    const caretaker = await UserRepository.findById(caretakerId);
    if (!caretaker || caretaker.role !== ROLES.CARETAKER || caretaker.accountStatus !== 'active' || String(caretaker.assignedLandlordId) !== String(landlordId)) throw ApiError.badRequest('Choose an active caretaker on your team.', 'INVALID_CARETAKER');

    const updates = {
      caretakerId,
      internalNotes: internalNotes || '',
      targetDate,
      landlordUpdate: landlordUpdate || '',
      status: MAINTENANCE_STATUS.IN_PROGRESS,
      $push: { statusHistory: historyEntry(MAINTENANCE_STATUS.IN_PROGRESS, 'assigned', { role: ROLES.LANDLORD, id: landlordId }, landlordUpdate || '') },
    };
    // A newly assigned caretaker should see the task even if the previous one archived it.
    if (String(issue.caretakerId || '') !== String(caretakerId)) updates.caretakerArchivedAt = null;
    const updated = await IssueRepository.updateById(issueId, updates);
    await NotificationService.notify({ userId: caretakerId, type: 'MAINTENANCE_ISSUE_ASSIGNED', title: 'Maintenance task assigned', message: `A ${issue.urgency} priority ${issue.category} issue has been assigned to you.`, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.CARETAKER](issue._id) });
    await NotificationService.notify({ userId: issue.tenantId, type: 'MAINTENANCE_ISSUE_UPDATED', title: 'Caretaker assigned', message: landlordUpdate || `A caretaker was assigned to your ${issue.category} issue.`, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.TENANT](issue._id) });
    return updated;
  }

  /** Caretaker marks the work done; the issue then waits for the tenant to confirm. */
  async resolve(issueId, caretakerId, resolutionNotes, files = []) {
    const issue = await IssueRepository.findOne({ _id: issueId, caretakerId });
    if (!issue) throw ApiError.notFound('Assigned issue not found', 'ISSUE_NOT_FOUND');
    this._assertNotRemoved(issue);
    const summary = reasonOrThrow(resolutionNotes, 'Add a summary of the repair work.', 'RESOLUTION_NOTES_REQUIRED');
    if (!OPEN_FOR_WORK.includes(issue.status)) throw ApiError.badRequest('This issue is not open for work.', 'ISSUE_NOT_OPEN');
    const urls = await FileStorageService.saveUploads(files, 'issue-photos');
    try {
      const updated = await this._markDone(issue, { role: ROLES.CARETAKER, id: caretakerId }, summary, { proofPhotos: urls });
      await NotificationService.notify({ userId: issue.landlordId, type: 'MAINTENANCE_ISSUE_DONE', title: 'Maintenance work done', message: `The caretaker finished the ${issue.category} issue. Waiting for the tenant to confirm.`, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.LANDLORD](issue._id) });
      return updated;
    } catch (err) { await FileStorageService.deleteByUrls(urls); throw err; }
  }

  /** Landlord marks the work done with a summary; the issue then waits for the tenant to confirm. */
  async completeByLandlord(issueId, landlordId, workSummary) {
    const issue = await IssueRepository.findOne({ _id: issueId, landlordId });
    if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
    this._assertNotRemoved(issue);
    if (!OPEN_FOR_WORK.includes(issue.status)) throw ApiError.badRequest('This issue is already marked done.', 'ISSUE_ALREADY_RESOLVED');
    const summary = reasonOrThrow(workSummary, 'Add a summary of the work done (3 to 2000 characters).', 'WORK_SUMMARY_REQUIRED');
    const updated = await this._markDone(issue, { role: ROLES.LANDLORD, id: landlordId }, summary);
    if (issue.caretakerId) await NotificationService.notify({ userId: issue.caretakerId, type: 'MAINTENANCE_ISSUE_DONE', title: 'Maintenance task marked done', message: `The landlord marked the ${issue.category} issue as done.`, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.CARETAKER](issue._id) });
    return updated;
  }

  /** Tenant confirms the fix (closes the issue) or says it is not solved yet (reopens it). */
  async confirm(issueId, tenantId, { solved, note }) {
    const issue = await IssueRepository.findOne({ _id: issueId, tenantId });
    if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
    this._assertNotRemoved(issue);
    if (issue.status !== MAINTENANCE_STATUS.AWAITING_CONFIRMATION) {
      throw ApiError.badRequest('This issue is not waiting for your confirmation.', 'ISSUE_NOT_AWAITING_CONFIRMATION');
    }
    const tenant = { role: ROLES.TENANT, id: tenantId };
    const comment = typeof note === 'string' ? note.trim().slice(0, 2000) : '';
    const updated = solved
      ? await IssueRepository.updateById(issueId, { status: MAINTENANCE_STATUS.RESOLVED, resolvedAt: new Date(), $push: { statusHistory: historyEntry(MAINTENANCE_STATUS.RESOLVED, 'confirmed', tenant, comment) } })
      : await IssueRepository.updateById(issueId, { status: MAINTENANCE_STATUS.IN_PROGRESS, doneAt: null, $push: { statusHistory: historyEntry(MAINTENANCE_STATUS.IN_PROGRESS, 'reopened', tenant, comment) } });

    const title = solved ? 'Tenant confirmed the fix' : 'Issue reopened by the tenant';
    const message = solved ? `The tenant confirmed the ${issue.category} issue is solved.` : `The tenant says the ${issue.category} issue is not solved yet.${comment ? ` "${comment}"` : ''}`;
    const type = solved ? 'MAINTENANCE_ISSUE_CONFIRMED' : 'MAINTENANCE_ISSUE_REOPENED';
    await NotificationService.notify({ userId: issue.landlordId, type, title, message, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.LANDLORD](issue._id) });
    if (issue.caretakerId) await NotificationService.notify({ userId: issue.caretakerId, type, title, message, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.CARETAKER](issue._id) });
    return updated;
  }

  /** Landlord removes an invalid or unnecessary report (soft delete with a reason the tenant can see). */
  async remove(issueId, landlordId, reason) {
    const issue = await IssueRepository.findOne({ _id: issueId, landlordId });
    if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
    if (issue.removedAt) throw ApiError.conflict('This report is already removed.', 'ISSUE_ALREADY_REMOVED');
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (trimmed.length < 3 || trimmed.length > 500) throw ApiError.badRequest('Please give a reason for removing this report (3 to 500 characters).', 'REASON_REQUIRED');
    const updated = await IssueRepository.updateById(issueId, {
      removedAt: new Date(), removedReason: trimmed, removedBy: landlordId,
      $push: { statusHistory: historyEntry(issue.status, 'removed', { role: ROLES.LANDLORD, id: landlordId }, trimmed) },
    });
    await NotificationService.notify({ userId: issue.tenantId, type: 'MAINTENANCE_ISSUE_REMOVED', title: 'Report removed', message: `Your landlord removed your ${issue.category} report. Reason: ${trimmed}`, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.TENANT](issue._id) });
    await AuditLogRepository.record({ action: 'MAINTENANCE_ISSUE_REMOVED', actorId: landlordId, actorRole: ROLES.LANDLORD, targetType: 'MaintenanceIssue', targetId: issue._id, metadata: { reason: trimmed } });
    return updated;
  }

  /** Archive for the tenant (resolved issues only) or the caretaker (personal view only). */
  async archive(issueId, requester) {
    const issue = await this._findForArchive(issueId, requester);
    if (requester.role === ROLES.TENANT) {
      if (issue.status !== MAINTENANCE_STATUS.RESOLVED) throw ApiError.badRequest('Only resolved issues can be moved to your archive.', 'ISSUE_NOT_RESOLVED');
      return IssueRepository.updateById(issueId, { tenantArchivedAt: new Date() });
    }
    return IssueRepository.updateById(issueId, { caretakerArchivedAt: new Date() });
  }

  /** Restore from the requester's own Archive. Only the landlord can restore a report the landlord removed. */
  async restore(issueId, requester) {
    if (requester.role === ROLES.LANDLORD) {
      const issue = await IssueRepository.findOne({ _id: issueId, landlordId: requester.id });
      if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
      if (!issue.removedAt) throw ApiError.badRequest('This report is not removed.', 'ISSUE_NOT_REMOVED');
      const updated = await IssueRepository.updateById(issueId, {
        removedAt: null, removedReason: null, removedBy: null,
        $push: { statusHistory: historyEntry(issue.status, 'restored', requester) },
      });
      await NotificationService.notify({ userId: issue.tenantId, type: 'MAINTENANCE_ISSUE_RESTORED', title: 'Report restored', message: `Your landlord restored your ${issue.category} report.`, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.TENANT](issue._id) });
      await AuditLogRepository.record({ action: 'MAINTENANCE_ISSUE_RESTORED', actorId: requester.id, actorRole: ROLES.LANDLORD, targetType: 'MaintenanceIssue', targetId: issue._id });
      return updated;
    }
    await this._findForArchive(issueId, requester);
    return IssueRepository.updateById(issueId, requester.role === ROLES.TENANT ? { tenantArchivedAt: null } : { caretakerArchivedAt: null });
  }

  async getMedia(issueId, kind, index, requester) {
    const issue = await IssueRepository.findById(issueId);
    if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
    const allowed = requester.role === ROLES.ADMIN ||
      (requester.role === ROLES.TENANT && String(issue.tenantId) === String(requester.id)) ||
      (requester.role === ROLES.LANDLORD && String(issue.landlordId) === String(requester.id)) ||
      (requester.role === ROLES.CARETAKER && String(issue.caretakerId) === String(requester.id));
    if (!allowed) throw ApiError.forbidden('You cannot view files for this issue.', 'FORBIDDEN_ISSUE_ACCESS');
    const files = kind === 'proof' ? issue.proofPhotos : issue.photos;
    const url = files[Number(index)];
    if (!url) throw ApiError.notFound('Issue photo not found', 'FILE_NOT_FOUND');
    return FileStorageService.getByUrl(url, 'issue-photos');
  }

  async _markDone(issue, requester, summary, extra = {}) {
    const updated = await IssueRepository.updateById(issue._id, {
      ...extra,
      status: MAINTENANCE_STATUS.AWAITING_CONFIRMATION,
      resolutionNotes: summary,
      doneAt: new Date(),
      $push: { statusHistory: historyEntry(MAINTENANCE_STATUS.AWAITING_CONFIRMATION, 'marked_done', requester, summary) },
    });
    await NotificationService.notify({ userId: issue.tenantId, type: 'MAINTENANCE_ISSUE_AWAITING_CONFIRMATION', title: 'Is your issue fixed?', message: `The ${issue.category} issue was marked done: ${summary}. Please confirm whether it is solved.`, relatedType: 'MaintenanceIssue', relatedId: issue._id, link: issueLink[ROLES.TENANT](issue._id) });
    return updated;
  }

  async _findForArchive(issueId, requester) {
    const owner = requester.role === ROLES.TENANT ? { tenantId: requester.id } : { caretakerId: requester.id };
    const issue = await IssueRepository.findOne({ _id: issueId, ...owner });
    if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
    return issue;
  }

  _assertNotRemoved(issue) {
    if (issue.removedAt) throw ApiError.badRequest('This report was removed by the landlord.', 'ISSUE_REMOVED');
  }
}
module.exports = new MaintenanceIssueService();
