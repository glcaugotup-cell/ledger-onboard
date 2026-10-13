const LandlordVerificationRepository = require('../repositories/LandlordVerificationRepository');
const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const NotificationService = require('./NotificationService');
const EmailNotificationService = require('./EmailNotificationService');
const FileStorageService = require('./FileStorageService');
const { FILE_CATEGORIES } = require('./FileStorageService');
const ApiError = require('../utils/ApiError');
const { ROLES, VERIFICATION_STATUS } = require('../utils/constants');

/**
 * Landlord business verification: a landlord submits a Mayor's/Business Permit
 * and BIR Form 2303 for admin review. The property-creation gate itself is
 * enforced in PropertyService.create.
 */
class LandlordVerificationService {
  async submit(landlordId, { permitFile, birFile }) {
    const existingPending = await LandlordVerificationRepository.findLatestByLandlord(landlordId);
    if (existingPending && existingPending.status === VERIFICATION_STATUS.PENDING) {
      throw ApiError.conflict('You already have a submission under review', 'VERIFICATION_ALREADY_PENDING');
    }

    // Documents from earlier submissions are kept (audit trail); only a failed save is rolled back.
    const [mayorBusinessPermitUrl, birForm2303Url] = await FileStorageService.saveUploads(
      [permitFile, birFile],
      FILE_CATEGORIES.LANDLORD_VERIFICATION
    );
    let submission;
    try {
      submission = await LandlordVerificationRepository.create({
        landlordId,
        mayorBusinessPermitUrl,
        birForm2303Url,
        status: VERIFICATION_STATUS.PENDING,
        submittedAt: new Date(),
      });
    } catch (err) {
      await FileStorageService.deleteByUrls([mayorBusinessPermitUrl, birForm2303Url]);
      throw err;
    }

    await UserRepository.updateById(landlordId, { businessVerificationStatus: VERIFICATION_STATUS.PENDING });

    await AuditLogRepository.record({
      action: 'BUSINESS_VERIFICATION_SUBMITTED',
      actorId: landlordId,
      actorRole: ROLES.LANDLORD,
      targetType: 'LandlordVerification',
      targetId: submission._id,
    });

    // Submission and its audit entry are already saved; notification trouble must not invite a duplicate retry.
    await NotificationService.notifyAdmins({
      type: 'BUSINESS_VERIFICATION_SUBMITTED',
      title: 'Business verification needs review',
      message: 'A landlord submitted business documents for verification.',
      relatedType: 'LandlordVerification', relatedId: submission._id,
      link: '/admin/landlord-verifications',
    }).catch(() => console.warn('[LandlordVerificationService] Admin notifications could not be saved.'));

    return { message: 'Documents submitted for review.', submission };
  }

  async getMine(landlordId) {
    const submission = await LandlordVerificationRepository.findLatestByLandlord(landlordId);
    return submission;
  }

  async listPending() {
    return LandlordVerificationRepository.findPending();
  }

  async review(submissionId, requester, { approve, rejectionReason }) {
    const submission = await LandlordVerificationRepository.findById(submissionId);
    if (!submission) throw ApiError.notFound('Submission not found', 'SUBMISSION_NOT_FOUND');
    if (submission.status !== VERIFICATION_STATUS.PENDING) {
      throw ApiError.conflict('This submission has already been reviewed', 'SUBMISSION_ALREADY_REVIEWED');
    }

    const status = approve ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.REJECTED;
    const updated = await LandlordVerificationRepository.updateById(submissionId, {
      status,
      reviewedBy: requester.id,
      reviewedAt: new Date(),
      rejectionReason: approve ? null : rejectionReason || 'Not specified',
    });

    await UserRepository.updateById(submission.landlordId, { businessVerificationStatus: status });

    await AuditLogRepository.record({
      action: 'BUSINESS_VERIFICATION_REVIEWED',
      actorId: requester.id,
      actorRole: requester.role,
      targetType: 'LandlordVerification',
      targetId: submission._id,
      metadata: { approved: approve },
    });

    const landlord = await UserRepository.findById(submission.landlordId);
    if (landlord) {
      await NotificationService.notify({
        userId: landlord._id,
        type: approve ? 'BUSINESS_VERIFICATION_APPROVED' : 'BUSINESS_VERIFICATION_REJECTED',
        title: approve ? 'Business verification approved' : 'Business verification needs attention',
        message: approve
          ? 'Your business has been verified. You can now upload and publish boarding houses.'
          : `Your submitted documents could not be approved: ${updated.rejectionReason}`,
        relatedType: 'LandlordVerification',
        relatedId: submission._id,
        link: '/landlord/verification',
      });
      // The decision is already saved, logged and notified in-app; email trouble must not turn it into an error.
      try {
        if (approve) await EmailNotificationService.deliver(landlord, 'sendBusinessVerificationApprovedEmail', [landlord.fullName]);
        else await EmailNotificationService.deliver(landlord, 'sendBusinessVerificationRejectedEmail', [landlord.fullName, updated.rejectionReason]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[LandlordVerificationService] verification result email failed:', err.message);
      }
    }

    return updated;
  }

  /** Document privacy gate — mirrors PaymentService.getProofImageInfo exactly: owning landlord or admin only. */
  async getDocumentPath(submissionId, docType, requester) {
    const submission = await LandlordVerificationRepository.findById(submissionId);
    if (!submission) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');

    const isOwner = requester.role === ROLES.LANDLORD && String(submission.landlordId) === String(requester.id);
    const isAdmin = requester.role === ROLES.ADMIN;
    if (!isOwner && !isAdmin) throw ApiError.forbidden('You do not have access to this document', 'FORBIDDEN_DOCUMENT_ACCESS');

    const url = docType === 'permit' ? submission.mayorBusinessPermitUrl : docType === 'bir' ? submission.birForm2303Url : null;
    if (!url) throw ApiError.notFound('Document not found', 'DOCUMENT_NOT_FOUND');
    return url;
  }
}

module.exports = new LandlordVerificationService();
