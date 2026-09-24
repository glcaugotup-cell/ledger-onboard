const LandlordVerificationRepository = require('../repositories/LandlordVerificationRepository');
const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const ApiError = require('../utils/ApiError');
const { ROLES, VERIFICATION_STATUS } = require('../utils/constants');

/**
 * Landlord business verification: a landlord submits a Mayor's/Business Permit
 * and BIR Form 2303 for admin review. The property-creation gate itself is
 * enforced in PropertyService.create.
 */
class LandlordVerificationService {
  async submit(landlordId, { mayorBusinessPermitUrl, birForm2303Url }) {
    const existingPending = await LandlordVerificationRepository.findLatestByLandlord(landlordId);
    if (existingPending && existingPending.status === VERIFICATION_STATUS.PENDING) {
      throw ApiError.conflict('You already have a submission under review', 'VERIFICATION_ALREADY_PENDING');
    }

    const submission = await LandlordVerificationRepository.create({
      landlordId,
      mayorBusinessPermitUrl,
      birForm2303Url,
      status: VERIFICATION_STATUS.PENDING,
      submittedAt: new Date(),
    });

    await UserRepository.updateById(landlordId, { businessVerificationStatus: VERIFICATION_STATUS.PENDING });

    await AuditLogRepository.record({
      action: 'BUSINESS_VERIFICATION_SUBMITTED',
      actorId: landlordId,
      actorRole: ROLES.LANDLORD,
      targetType: 'LandlordVerification',
      targetId: submission._id,
    });

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
      });
      if (approve) await EmailService.sendBusinessVerificationApprovedEmail(landlord.email, landlord.fullName);
      else await EmailService.sendBusinessVerificationRejectedEmail(landlord.email, landlord.fullName, updated.rejectionReason);
    }

    await AuditLogRepository.record({
      action: 'BUSINESS_VERIFICATION_REVIEWED',
      actorId: requester.id,
      actorRole: requester.role,
      targetType: 'LandlordVerification',
      targetId: submission._id,
      metadata: { approved: approve },
    });

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
