const IssueRepository = require('../repositories/MaintenanceIssueRepository');
const ReservationRepository = require('../repositories/ReservationRepository');
const UserRepository = require('../repositories/UserRepository');
const FileStorageService = require('./FileStorageService');
const NotificationService = require('./NotificationService');
const ApiError = require('../utils/ApiError');
const { ROLES, RESERVATION_STATUS } = require('../utils/constants');

class MaintenanceIssueService {
  async list(requester) {
    const filter = requester.role === ROLES.TENANT ? { tenantId: requester.id }
      : requester.role === ROLES.LANDLORD ? { landlordId: requester.id }
        : { caretakerId: requester.id };
    return IssueRepository.find(filter, { populate: 'tenantId landlordId caretakerId roomId propertyId', sort: { createdAt: -1 } });
  }

  async create(tenantId, data, files = []) {
    const categories = ['Plumbing', 'Electrical', 'Appliance', 'Structural', 'Pest control', 'Cleaning', 'Other'];
    if (!categories.includes(data.category)) throw ApiError.badRequest('Choose a valid issue category.', 'INVALID_ISSUE_CATEGORY');
    const reservation = await ReservationRepository.findById(data.reservationId, { populate: 'roomId propertyId' });
    if (!reservation || String(reservation.tenantId) !== String(tenantId) || reservation.status !== RESERVATION_STATUS.APPROVED) {
      throw ApiError.badRequest('Choose one of your current tenancies.', 'ACTIVE_TENANCY_REQUIRED');
    }
    const urls = await FileStorageService.saveUploads(files, 'issue-photos');
    try {
      const issue = await IssueRepository.create({ tenantId, landlordId: reservation.propertyId.landlordId, reservationId: reservation._id, propertyId: reservation.propertyId._id, roomId: reservation.roomId._id, category: data.category, urgency: data.urgency, description: data.description, photos: urls });
      await NotificationService.notify({ userId: reservation.propertyId.landlordId, type: 'MAINTENANCE_ISSUE_CREATED', title: 'New maintenance issue', message: `${data.urgency} priority ${data.category} issue reported for ${reservation.propertyId.propertyName}, Room ${reservation.roomId.roomNumber}.`, relatedType: 'MaintenanceIssue', relatedId: issue._id }).catch(() => {});
      return issue;
    } catch (err) {
      await FileStorageService.deleteByUrls(urls);
      throw err;
    }
  }

  async assign(issueId, landlordId, { caretakerId, internalNotes, targetDate, landlordUpdate }) {
    const issue = await IssueRepository.findOne({ _id: issueId, landlordId });
    if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
    const caretaker = await UserRepository.findById(caretakerId);
    if (!caretaker || caretaker.role !== ROLES.CARETAKER || caretaker.accountStatus !== 'active' || String(caretaker.assignedLandlordId) !== String(landlordId)) throw ApiError.badRequest('Choose an active caretaker on your team.', 'INVALID_CARETAKER');
    const updated = await IssueRepository.updateById(issueId, { caretakerId, internalNotes: internalNotes || '', targetDate: targetDate || null, landlordUpdate: landlordUpdate || '', status: 'in_progress' });
    await NotificationService.notify({ userId: caretakerId, type: 'MAINTENANCE_ISSUE_ASSIGNED', title: 'Maintenance task assigned', message: `A ${issue.urgency} priority ${issue.category} issue has been assigned to you.`, relatedType: 'MaintenanceIssue', relatedId: issue._id });
    await NotificationService.notify({ userId: issue.tenantId, type: 'MAINTENANCE_ISSUE_UPDATED', title: 'Issue in progress', message: landlordUpdate || 'Your reported issue has been assigned to a caretaker.', relatedType: 'MaintenanceIssue', relatedId: issue._id });
    return updated;
  }

  async resolve(issueId, caretakerId, resolutionNotes, files = []) {
    const issue = await IssueRepository.findOne({ _id: issueId, caretakerId });
    if (!issue) throw ApiError.notFound('Assigned issue not found', 'ISSUE_NOT_FOUND');
    if (!resolutionNotes?.trim()) throw ApiError.badRequest('Add a summary of the repair work.', 'RESOLUTION_NOTES_REQUIRED');
    const urls = await FileStorageService.saveUploads(files, 'issue-photos');
    try {
      const updated = await IssueRepository.updateById(issueId, { status: 'resolved', resolutionNotes: resolutionNotes.trim(), proofPhotos: urls, resolvedAt: new Date() });
      await NotificationService.notify({ userId: issue.tenantId, type: 'MAINTENANCE_ISSUE_RESOLVED', title: 'Issue resolved', message: 'Your maintenance issue has been marked resolved.', relatedType: 'MaintenanceIssue', relatedId: issue._id });
      await NotificationService.notify({ userId: issue.landlordId, type: 'MAINTENANCE_ISSUE_RESOLVED', title: 'Maintenance issue resolved', message: `${issue.category} issue marked resolved by the caretaker.`, relatedType: 'MaintenanceIssue', relatedId: issue._id });
      return updated;
    } catch (err) { await FileStorageService.deleteByUrls(urls); throw err; }
  }

  async completeByLandlord(issueId, landlordId) {
    const issue = await IssueRepository.findOne({ _id: issueId, landlordId });
    if (!issue) throw ApiError.notFound('Issue not found', 'ISSUE_NOT_FOUND');
    if (issue.status === 'resolved') throw ApiError.badRequest('This issue is already marked resolved.', 'ISSUE_ALREADY_RESOLVED');
    const updated = await IssueRepository.updateById(issueId, {
      status: 'resolved',
      resolutionNotes: issue.resolutionNotes || 'Marked complete by the landlord.',
      resolvedAt: new Date(),
    });
    await NotificationService.notify({ userId: issue.tenantId, type: 'MAINTENANCE_ISSUE_RESOLVED', title: 'Issue resolved', message: 'Your landlord marked your maintenance issue as completed.', relatedType: 'MaintenanceIssue', relatedId: issue._id });
    if (issue.caretakerId) await NotificationService.notify({ userId: issue.caretakerId, type: 'MAINTENANCE_ISSUE_RESOLVED', title: 'Maintenance task completed', message: `The landlord marked the ${issue.category} issue as completed.`, relatedType: 'MaintenanceIssue', relatedId: issue._id });
    return updated;
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
}
module.exports = new MaintenanceIssueService();
