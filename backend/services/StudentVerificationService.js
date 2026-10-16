const StudentVerificationRepository = require('../repositories/StudentVerificationRepository');
const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const NotificationService = require('./NotificationService');
const FileStorageService = require('./FileStorageService');
const { FILE_CATEGORIES } = require('./FileStorageService');
const ApiError = require('../utils/ApiError');
const { ROLES, VERIFICATION_STATUS } = require('../utils/constants');
const { isStudentIdYearCurrent, studentIdState, lastValidDay } = require('../utils/studentId');

const STUDENT_PAGE = '/tenant/verification';
const ADMIN_PAGE = '/admin/landlord-verifications?tab=students';

/**
 * Student ID verification, the tenant-side twin of LandlordVerificationService: a student
 * uploads the front and back of their school ID with the school and the years printed on it,
 * and an admin approves or rejects it. The reservation gate itself is enforced in
 * ReservationService.create. Results are in-app only (no email).
 */
class StudentVerificationService {
  async submit(tenantId, { frontFile, backFile, school, validFromYear, validUntilYear }) {
    const tenant = await UserRepository.findById(tenantId);
    if (studentIdState(tenant) === 'VERIFIED') {
      throw ApiError.conflict(`Your student ID is already verified until ${lastValidDay(tenant.studentIdValidUntilYear)}.`, 'STUDENT_ALREADY_VERIFIED');
    }
    const latest = await StudentVerificationRepository.findLatestByTenant(tenantId);
    if (latest && latest.status === VERIFICATION_STATUS.PENDING) {
      throw ApiError.conflict('You already have a school ID under review', 'VERIFICATION_ALREADY_PENDING');
    }

    // Photos from earlier submissions are kept (audit trail); only a failed save is rolled back.
    const [idFrontUrl, idBackUrl] = await FileStorageService.saveUploads([frontFile, backFile], FILE_CATEGORIES.STUDENT_VERIFICATION);
    let submission;
    try {
      submission = await StudentVerificationRepository.create({
        tenantId, idFrontUrl, idBackUrl, school, validFromYear, validUntilYear,
        status: VERIFICATION_STATUS.PENDING,
        submittedAt: new Date(),
      });
    } catch (err) {
      await FileStorageService.deleteByUrls([idFrontUrl, idBackUrl]);
      throw err;
    }

    await UserRepository.updateById(tenantId, { studentVerificationStatus: VERIFICATION_STATUS.PENDING });
    await AuditLogRepository.record({
      action: 'STUDENT_VERIFICATION_SUBMITTED',
      actorId: tenantId,
      actorRole: ROLES.TENANT,
      targetType: 'StudentVerification',
      targetId: submission._id,
      metadata: { school, validFromYear, validUntilYear },
    });

    // The submission and its audit entry are saved; notification trouble must not invite a duplicate retry.
    await NotificationService.notifyAdmins({
      type: 'STUDENT_VERIFICATION_SUBMITTED',
      title: 'Student ID needs review',
      message: `${tenant?.fullName || 'A student'} submitted a school ID for verification.`,
      relatedType: 'StudentVerification', relatedId: submission._id,
      link: ADMIN_PAGE,
    }).catch(() => console.warn('[StudentVerificationService] Admin notifications could not be saved.'));

    return { message: 'School ID submitted for review.', submission };
  }

  /**
   * Before the admin decides, the student can swap the front and/or back photo on the same
   * submission. The earlier photos are kept, like those of earlier submissions. If the admin
   * decides first, nothing changes and the new uploads are removed.
   */
  async replaceDocuments(tenantId, submissionId, { frontFile, backFile }) {
    const submission = await StudentVerificationRepository.findById(submissionId);
    if (!submission || String(submission.tenantId) !== String(tenantId)) {
      throw ApiError.notFound('Submission not found', 'SUBMISSION_NOT_FOUND');
    }
    if (submission.status !== VERIFICATION_STATUS.PENDING) {
      throw ApiError.conflict('This submission has already been reviewed', 'SUBMISSION_ALREADY_REVIEWED');
    }

    const replacing = [
      frontFile && { doc: 'front', field: 'idFrontUrl', file: frontFile },
      backFile && { doc: 'back', field: 'idBackUrl', file: backFile },
    ].filter(Boolean);
    const urls = await FileStorageService.saveUploads(replacing.map((r) => r.file), FILE_CATEGORIES.STUDENT_VERIFICATION);
    const updates = Object.fromEntries(replacing.map((r, i) => [r.field, urls[i]]));
    const updated = await StudentVerificationRepository.updatePendingOfTenant(submissionId, tenantId, { ...updates, documentsUpdatedAt: new Date() });
    if (!updated) {
      await FileStorageService.deleteByUrls(urls);
      throw ApiError.conflict('This submission has already been reviewed', 'SUBMISSION_ALREADY_REVIEWED');
    }

    await AuditLogRepository.record({
      action: 'STUDENT_VERIFICATION_DOCUMENTS_REPLACED',
      actorId: tenantId,
      actorRole: ROLES.TENANT,
      targetType: 'StudentVerification',
      targetId: submission._id,
      metadata: { documents: replacing.map((r) => r.doc), replaced: Object.fromEntries(replacing.map((r) => [r.doc, submission[r.field]])) },
    });

    return { message: replacing.length === 2 ? 'Both photos were replaced.' : 'Photo replaced.', submission: updated };
  }

  async getMine(tenantId) {
    return StudentVerificationRepository.findLatestByTenant(tenantId);
  }

  async listPending() {
    return StudentVerificationRepository.findPending();
  }

  /**
   * Approve (optionally correcting the last valid year read off the photo) or reject with a reason.
   * Conditional on the submission still being pending, so two admins can't both decide.
   */
  async review(submissionId, requester, { approve, rejectionReason, validUntilYear }) {
    const submission = await StudentVerificationRepository.findById(submissionId);
    if (!submission) throw ApiError.notFound('Submission not found', 'SUBMISSION_NOT_FOUND');
    if (submission.status !== VERIFICATION_STATUS.PENDING) {
      throw ApiError.conflict('This submission has already been reviewed', 'SUBMISSION_ALREADY_REVIEWED');
    }
    const reason = (rejectionReason || '').trim();
    if (!approve && !reason) throw ApiError.badRequest('Give the student a reason for rejecting their ID', 'REJECTION_REASON_REQUIRED');

    const finalYear = approve && validUntilYear !== undefined && validUntilYear !== null ? validUntilYear : submission.validUntilYear;
    if (approve) {
      if (finalYear < submission.validFromYear) {
        throw ApiError.badRequest(`The last valid year can't be before ${submission.validFromYear}`, 'INVALID_VALID_UNTIL_YEAR');
      }
      if (!isStudentIdYearCurrent(finalYear)) {
        throw ApiError.badRequest(`This ID was only valid until ${lastValidDay(finalYear)}. Reject it and ask for a current school ID.`, 'STUDENT_ID_EXPIRED');
      }
    }

    const status = approve ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.REJECTED;
    const updated = await StudentVerificationRepository.updatePending(submissionId, {
      status,
      reviewedBy: requester.id,
      reviewedAt: new Date(),
      rejectionReason: approve ? null : reason,
      validUntilYear: finalYear,
    });
    if (!updated) throw ApiError.conflict('This submission has already been reviewed', 'SUBMISSION_ALREADY_REVIEWED');

    await UserRepository.updateById(submission.tenantId, approve
      ? { studentVerificationStatus: status, studentSchool: submission.school, studentIdValidUntilYear: finalYear }
      : { studentVerificationStatus: status });

    await AuditLogRepository.record({
      action: 'STUDENT_VERIFICATION_REVIEWED',
      actorId: requester.id,
      actorRole: requester.role,
      targetType: 'StudentVerification',
      targetId: submission._id,
      metadata: {
        approved: approve,
        ...(approve ? { validUntilYear: finalYear } : {}),
        ...(approve && finalYear !== submission.validUntilYear ? { correctedFromYear: submission.validUntilYear } : {}),
      },
    });

    // The decision is saved and logged; a notification problem must not turn it into an error.
    try {
      await NotificationService.notify({
        userId: submission.tenantId,
        type: approve ? 'STUDENT_VERIFICATION_APPROVED' : 'STUDENT_VERIFICATION_REJECTED',
        title: approve ? 'Student ID verified' : 'Student ID needs attention',
        message: approve
          ? `You're verified as a student of ${submission.school} until ${lastValidDay(finalYear)}. You can now reserve rooms.`
          : `Your school ID could not be approved: ${reason}`,
        relatedType: 'StudentVerification',
        relatedId: submission._id,
        link: STUDENT_PAGE,
      });
    } catch {
      console.warn('[StudentVerificationService] The student could not be notified of the review.');
    }

    return updated;
  }

  /** Photo privacy gate, like landlord documents: the student who uploaded it, or an admin. */
  async getDocumentPath(submissionId, docType, requester) {
    const submission = await StudentVerificationRepository.findById(submissionId);
    if (!submission) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');

    const isOwner = requester.role === ROLES.TENANT && String(submission.tenantId) === String(requester.id);
    const isAdmin = requester.role === ROLES.ADMIN;
    if (!isOwner && !isAdmin) throw ApiError.forbidden('You do not have access to this document', 'FORBIDDEN_DOCUMENT_ACCESS');

    const url = docType === 'front' ? submission.idFrontUrl : docType === 'back' ? submission.idBackUrl : null;
    if (!url) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
    return url;
  }
}

module.exports = new StudentVerificationService();
