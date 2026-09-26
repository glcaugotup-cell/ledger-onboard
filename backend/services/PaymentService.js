const PaymentTransactionRepository = require('../repositories/PaymentTransactionRepository');
const BillingSOARepository = require('../repositories/BillingSOARepository');
const RoomRepository = require('../repositories/RoomRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const BillingService = require('./BillingService');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const FileStorageService = require('./FileStorageService');
const { FILE_CATEGORIES } = require('./FileStorageService');
const UserRepository = require('../repositories/UserRepository');
const ApiError = require('../utils/ApiError');
const { ROLES, PAYMENT_METHOD, VERIFICATION_STATUS } = require('../utils/constants');
const { withPaymentContext } = require('./displayContext');

class PaymentService {
  /** Tenant uploads a GCash payment screenshot as proof. */
  async submitGcashProof(tenantId, { soaId, amount }, proofFile) {
    const soa = await BillingSOARepository.findById(soaId);
    if (!soa) throw ApiError.notFound('Statement of account not found', 'SOA_NOT_FOUND');
    if (String(soa.tenantId) !== String(tenantId)) {
      throw ApiError.forbidden('This statement of account does not belong to you', 'FORBIDDEN_SOA_ACCESS');
    }
    this._assertAmountWithinBalance(soa, amount);
    if (!proofFile) throw ApiError.badRequest('Proof of payment image is required', 'PROOF_IMAGE_REQUIRED');

    const proofImageURL = await FileStorageService.saveUpload(proofFile, FILE_CATEGORIES.PAYMENT_PROOFS);
    try {
      return await PaymentTransactionRepository.create({
        soaId,
        tenantId,
        paymentMethod: PAYMENT_METHOD.GCASH_SCREENSHOT,
        amount,
        proofImageURL,
        verificationStatus: VERIFICATION_STATUS.PENDING,
        timestamp: new Date(),
      });
    } catch (err) {
      await FileStorageService.deleteByUrls([proofImageURL]);
      throw err;
    }
  }

  /** Caretaker logs cash collected in person. */
  async submitCashPayment(caretaker, { soaId, amount }) {
    const soa = await BillingSOARepository.findById(soaId);
    if (!soa) throw ApiError.notFound('Statement of account not found', 'SOA_NOT_FOUND');

    this._assertAmountWithinBalance(soa, amount);

    const room = await RoomRepository.findById(soa.roomId);
    const property = await PropertyRepository.findById(room.propertyId);
    const isAssigned = property.caretakerIds.some((id) => String(id) === String(caretaker.id));
    if (!isAssigned) {
      throw ApiError.forbidden('You are not assigned to this property', 'NOT_ASSIGNED_TO_PROPERTY');
    }

    return PaymentTransactionRepository.create({
      soaId,
      tenantId: soa.tenantId,
      paymentMethod: PAYMENT_METHOD.CASH_ON_SITE,
      amount,
      cashCollectedByCaretakerId: caretaker.id,
      verificationStatus: VERIFICATION_STATUS.PENDING,
      timestamp: new Date(),
    });
  }

  /** A payment can't be more than what is still owed on the statement. */
  _assertAmountWithinBalance(soa, amount) {
    if (!(soa.remainingBalance > 0)) {
      throw ApiError.badRequest('This statement is already fully paid', 'SOA_ALREADY_PAID');
    }
    if (Number(amount) > soa.remainingBalance) {
      throw ApiError.badRequest(`Amount cannot be more than the remaining balance of ₱${soa.remainingBalance.toLocaleString('en-PH')}`, 'AMOUNT_EXCEEDS_BALANCE');
    }
  }

  /** Payments visible to the requester, labeled with tenant, bill period, room and property for display. */
  async listForRequester(requester) {
    return withPaymentContext(await this._listForRequester(requester));
  }

  async _listForRequester(requester) {
    if (requester.role === ROLES.TENANT) return PaymentTransactionRepository.findByTenant(requester.id);

    if (requester.role === ROLES.ADMIN) return PaymentTransactionRepository.find({}, { sort: { createdAt: -1 } });

    if (requester.role === ROLES.LANDLORD) {
      const properties = await PropertyRepository.findByLandlord(requester.id);
      const rooms = await RoomRepository.find({ propertyId: { $in: properties.map((p) => p._id) } });
      const soas = await BillingSOARepository.findByRoomIds(rooms.map((r) => r._id));
      return PaymentTransactionRepository.find({ soaId: { $in: soas.map((s) => s._id) } }, { sort: { createdAt: -1 } });
    }

    if (requester.role === ROLES.CARETAKER) {
      return PaymentTransactionRepository.find({ cashCollectedByCaretakerId: requester.id }, { sort: { createdAt: -1 } });
    }

    return [];
  }

  async verifyPayment(paymentId, requester, { approve, rejectionReason }) {
    const payment = await PaymentTransactionRepository.findById(paymentId);
    if (!payment) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
    if (payment.verificationStatus !== VERIFICATION_STATUS.PENDING) {
      throw ApiError.conflict('This payment has already been reviewed', 'PAYMENT_ALREADY_REVIEWED');
    }

    await this._assertCanVerify(payment, requester);

    const verificationStatus = approve ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.REJECTED;
    const updated = await PaymentTransactionRepository.updateById(paymentId, {
      verificationStatus,
      verifiedBy: requester.id,
      verifiedAt: new Date(),
      rejectionReason: approve ? null : rejectionReason || 'Not specified',
    });

    if (approve) {
      await BillingService.applyVerifiedPayment(payment.soaId, payment.amount);
    }

    const tenant = await UserRepository.findById(payment.tenantId);
    await NotificationService.notify({
      userId: payment.tenantId,
      type: approve ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
      title: approve ? 'Payment verified' : 'Payment not verified',
      message: approve
        ? `Your payment of PHP ${payment.amount} was verified.`
        : `Your payment of PHP ${payment.amount} could not be verified: ${updated.rejectionReason}`,
      relatedType: 'PaymentTransaction',
      relatedId: payment._id,
    });
    if (tenant) {
      if (approve) await EmailService.sendPaymentVerifiedEmail(tenant.email, tenant.fullName, payment.amount);
      else await EmailService.sendPaymentRejectedEmail(tenant.email, tenant.fullName, updated.rejectionReason);
    }

    await AuditLogRepository.record({
      action: 'PAYMENT_VERIFIED',
      actorId: requester.id,
      actorRole: requester.role,
      targetType: 'PaymentTransaction',
      targetId: payment._id,
      metadata: { approved: approve },
    });

    return updated;
  }

  /**
   * Payment proofs are never public: resolves the file path only for the owning
   * tenant, the property's landlord/caretaker, or an admin.
   */
  async getProofImageInfo(paymentId, requester) {
    const payment = await PaymentTransactionRepository.findById(paymentId);
    if (!payment || !payment.proofImageURL) throw ApiError.notFound('Proof image not found', 'PROOF_IMAGE_NOT_FOUND');

    if (requester.role === ROLES.ADMIN) return payment;
    if (requester.role === ROLES.TENANT && String(payment.tenantId) === String(requester.id)) return payment;

    if (requester.role === ROLES.LANDLORD || requester.role === ROLES.CARETAKER) {
      const soa = await BillingSOARepository.findById(payment.soaId);
      const room = await RoomRepository.findById(soa.roomId);
      const property = await PropertyRepository.findById(room.propertyId);
      const isLandlordOwner = requester.role === ROLES.LANDLORD && String(property.landlordId) === String(requester.id);
      const isAssignedCaretaker = requester.role === ROLES.CARETAKER && property.caretakerIds.some((id) => String(id) === String(requester.id));
      if (isLandlordOwner || isAssignedCaretaker) return payment;
    }

    throw ApiError.forbidden('You do not have access to this proof image', 'FORBIDDEN_PROOF_ACCESS');
  }

  async _assertCanVerify(payment, requester) {
    if (requester.role === ROLES.ADMIN) return;

    const soa = await BillingSOARepository.findById(payment.soaId);
    const room = await RoomRepository.findById(soa.roomId);
    const property = await PropertyRepository.findById(room.propertyId);

    if (requester.role === ROLES.LANDLORD && String(property.landlordId) === String(requester.id)) return;

    // Caretakers may only verify cash payments they personally collected.
    if (
      requester.role === ROLES.CARETAKER &&
      payment.paymentMethod === PAYMENT_METHOD.CASH_ON_SITE &&
      String(payment.cashCollectedByCaretakerId) === String(requester.id)
    ) {
      return;
    }

    throw ApiError.forbidden('You do not have permission to verify this payment', 'FORBIDDEN_PAYMENT_VERIFY');
  }
}

module.exports = new PaymentService();
