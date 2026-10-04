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
const { ACTIVE_REFERENCE_STATUSES } = require('../utils/paymentReferenceIndex');

class PaymentService {
  /** Tenant records the GCash transaction reference after paying with the landlord's QR. */
  async submitGcashQr(tenantId, { soaId, amount, referenceNumber }) {
    const soa = await BillingSOARepository.findById(soaId);
    if (!soa) throw ApiError.notFound('Statement of account not found', 'SOA_NOT_FOUND');
    if (String(soa.tenantId) !== String(tenantId)) throw ApiError.forbidden('This statement of account does not belong to you', 'FORBIDDEN_SOA_ACCESS');
    this._assertAmountWithinBalance(soa, amount);
    // Same rules as the form: spaces and dashes are formatting, anything else must be 10-13 digits.
    // Kept as a string so leading zeros survive.
    const reference = String(referenceNumber || '').replace(/[\s-]/g, '');
    if (!/^\d{10,13}$/.test(reference)) throw ApiError.badRequest('Reference number must be 10 to 13 digits.', 'INVALID_REFERENCE_NUMBER');

    // A reference may be reused only after its earlier payment was rejected. The unique
    // index (see utils/paymentReferenceIndex.js) backs this check up once it has been created.
    const alreadyUsed = await PaymentTransactionRepository.findOne({ referenceNumber: reference, verificationStatus: { $in: ACTIVE_REFERENCE_STATUSES } });
    if (alreadyUsed) throw ApiError.conflict('This reference number has already been used.', 'REFERENCE_NUMBER_USED');
    try {
      const payment = await PaymentTransactionRepository.create({
        soaId, tenantId, paymentMethod: PAYMENT_METHOD.GCASH_QR, amount,
        referenceNumber: reference, verificationStatus: VERIFICATION_STATUS.PENDING, timestamp: new Date(),
      });
      await this._notifyLandlordOfPayment(soa, tenantId, 'PAYMENT_SUBMITTED', 'Payment submitted', `A tenant submitted a GCash payment of ₱${Number(amount).toLocaleString('en-PH')} for verification.`, payment._id);
      return payment;
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict('This reference number has already been used.', 'REFERENCE_NUMBER_USED');
      throw err;
    }
  }

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
    let payment;
    try {
      payment = await PaymentTransactionRepository.create({
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
    await this._notifyLandlordOfPayment(soa, tenantId, 'PAYMENT_SUBMITTED', 'Payment proof submitted', `A tenant submitted proof of a GCash payment of ₱${Number(amount).toLocaleString('en-PH')}.`, payment._id);
    return payment;
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

    const payment = await PaymentTransactionRepository.create({
      soaId,
      tenantId: soa.tenantId,
      paymentMethod: PAYMENT_METHOD.CASH_ON_SITE,
      amount,
      cashCollectedByCaretakerId: caretaker.id,
      verificationStatus: VERIFICATION_STATUS.PENDING,
      timestamp: new Date(),
    });
    await this._notifyLandlordOfPayment(soa, soa.tenantId, 'CASH_PAYMENT_LOGGED', 'Cash collection logged', `Your caretaker logged a cash payment of ₱${Number(amount).toLocaleString('en-PH')}.`, payment._id);
    return payment;
  }

  /** Tells the bill's landlord about a payment to review; a notification problem never fails the payment. */
  async _notifyLandlordOfPayment(soa, tenantId, type, title, message, paymentId) {
    try {
      const room = await RoomRepository.findById(soa.roomId);
      const property = room && await PropertyRepository.findById(room.propertyId);
      if (!property) return;
      await NotificationService.notify({ userId: property.landlordId, type, title, message, relatedType: 'PaymentTransaction', relatedId: paymentId, link: `/landlord/payments?payment=${paymentId}` });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[notifications] payment notification failed:', err.message);
    }
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

  async verifyPayment(paymentId, requester, { approve, decision, remainingBalance, rejectionReason }) {
    const payment = await PaymentTransactionRepository.findById(paymentId);
    if (!payment) throw ApiError.notFound('Payment not found', 'PAYMENT_NOT_FOUND');
    if (payment.verificationStatus !== VERIFICATION_STATUS.PENDING) {
      throw ApiError.conflict('This payment has already been reviewed', 'PAYMENT_ALREADY_REVIEWED');
    }

    await this._assertCanVerify(payment, requester);

    const isBalanceAdjustment = decision === 'SET_BALANCE';
    const isApproved = decision ? true : Boolean(approve);
    const verificationStatus = isApproved ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.REJECTED;
    let verifiedAmount = null;
    let adjustedBalance = null;
    if (isBalanceAdjustment) {
      if (requester.role !== ROLES.LANDLORD && requester.role !== ROLES.ADMIN) {
        throw ApiError.forbidden('Only the landlord can set a remaining balance', 'FORBIDDEN_BALANCE_ADJUSTMENT');
      }
      const soa = await BillingSOARepository.findById(payment.soaId);
      const nextBalance = Number(remainingBalance);
      const minimumBalance = Math.max(0, soa.remainingBalance - payment.amount);
      if (!Number.isFinite(nextBalance) || nextBalance < minimumBalance || nextBalance >= soa.remainingBalance) {
        throw ApiError.badRequest('Remaining balance must reflect a payment between zero and the submitted amount', 'INVALID_REMAINING_BALANCE');
      }
      adjustedBalance = nextBalance;
      verifiedAmount = Number((soa.remainingBalance - nextBalance).toFixed(2));
    } else if (isApproved) {
      verifiedAmount = payment.amount;
    }
    const updated = await PaymentTransactionRepository.updateById(paymentId, {
      verificationStatus,
      amountVerified: verifiedAmount,
      balanceAfter: adjustedBalance,
      verifiedBy: requester.id,
      verifiedAt: new Date(),
      rejectionReason: isApproved ? null : rejectionReason || 'Not specified',
    });

    if (isBalanceAdjustment) {
      await BillingService.setRemainingBalance(payment.soaId, adjustedBalance);
    } else if (isApproved) {
      await BillingService.applyVerifiedPayment(payment.soaId, verifiedAmount);
    }

    const tenant = await UserRepository.findById(payment.tenantId);
    await NotificationService.notify({
      userId: payment.tenantId,
      type: isApproved ? 'PAYMENT_VERIFIED' : 'PAYMENT_REJECTED',
      title: isApproved ? 'Payment verified' : 'Payment not verified',
      message: isApproved
        ? `Your payment was reviewed. Confirmed amount: PHP ${verifiedAmount}.${adjustedBalance !== null ? ` Current balance: PHP ${adjustedBalance}.` : ''}`
        : `Your payment of PHP ${payment.amount} could not be verified: ${updated.rejectionReason}`,
      relatedType: 'PaymentTransaction',
      relatedId: payment._id,
      link: `/tenant/apartment?tab=billing&bill=${payment.soaId}`,
    });
    if (tenant) {
      if (isApproved) await EmailService.sendPaymentVerifiedEmail(tenant.email, tenant.fullName, verifiedAmount);
      else await EmailService.sendPaymentRejectedEmail(tenant.email, tenant.fullName, updated.rejectionReason);
    }

    await AuditLogRepository.record({
      action: 'PAYMENT_VERIFIED',
      actorId: requester.id,
      actorRole: requester.role,
      targetType: 'PaymentTransaction',
      targetId: payment._id,
      metadata: { approved: isApproved, amountVerified: verifiedAmount, balanceAfter: adjustedBalance },
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
