const BillingSOARepository = require('../repositories/BillingSOARepository');
const RoomRepository = require('../repositories/RoomRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const ApiError = require('../utils/ApiError');
const { roundMoney } = require('../utils/money');
const { ROLES, PAYMENT_STATUS } = require('../utils/constants');

const DUE_DAYS_AFTER_PERIOD = 10;

/**
 * SOA (Statement of Account) generation and arrears tracking.
 * SOA Total Due = Base Rent + Electric Share + Water Share + Unpaid Arrears
 * Remaining Balance = Total Due - Amount Paid
 */
class BillingService {
  /** Called by UtilityCalculatorService right after a reading is logged. */
  async generateSOAsFromReading(reading) {
    const room = await RoomRepository.findById(reading.roomId);
    if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');

    const soas = [];
    for (const occupant of reading.occupants) {
      const soa = await this._generateSOAForTenant({
        tenantId: occupant.tenantId,
        roomId: reading.roomId,
        billingPeriod: reading.readingMonth,
        baseRent: room.monthlyBaseRent,
        electricShare: occupant.electricityShare,
        waterShare: occupant.waterShare,
      });
      soas.push(soa);
    }
    return soas;
  }

  async _generateSOAForTenant({ tenantId, roomId, billingPeriod, baseRent, electricShare, waterShare }) {
    const existing = await BillingSOARepository.findByTenantAndPeriod(tenantId, billingPeriod);
    if (existing) return existing; // idempotent — a reading is only ever logged once per room/month anyway

    const previousArrears = await this._computeOutstandingArrears(tenantId, billingPeriod);
    const utilityCharge = roundMoney(electricShare + waterShare);
    const totalAmountDue = roundMoney(baseRent + utilityCharge + previousArrears);
    const dueDate = new Date(billingPeriod);
    dueDate.setUTCDate(dueDate.getUTCDate() + DUE_DAYS_AFTER_PERIOD);

    return BillingSOARepository.create({
      tenantId,
      roomId,
      billingPeriod,
      baseRent,
      electricShare,
      waterShare,
      utilityCharge,
      previousArrears,
      totalAmountDue,
      amountPaid: 0,
      remainingBalance: totalAmountDue,
      paymentStatus: PAYMENT_STATUS.UNPAID,
      dueDate,
      generatedAt: new Date(),
    });
  }

  async _computeOutstandingArrears(tenantId, beforePeriod) {
    const mostRecent = await BillingSOARepository.findMostRecentByTenant(tenantId);
    if (!mostRecent || mostRecent.billingPeriod >= beforePeriod) return 0;
    if ([PAYMENT_STATUS.PAID].includes(mostRecent.paymentStatus)) return 0;
    return roundMoney(mostRecent.remainingBalance);
  }

  /** Applies a newly VERIFIED payment to its SOA. Called by PaymentService. */
  async applyVerifiedPayment(soaId, amount) {
    const soa = await BillingSOARepository.findById(soaId);
    if (!soa) throw ApiError.notFound('Statement of account not found', 'SOA_NOT_FOUND');

    const amountPaid = roundMoney(soa.amountPaid + amount);
    const remainingBalance = roundMoney(Math.max(0, soa.totalAmountDue - amountPaid));
    let paymentStatus = PAYMENT_STATUS.PARTIAL;
    if (remainingBalance <= 0) paymentStatus = PAYMENT_STATUS.PAID;
    else if (amountPaid <= 0) paymentStatus = this._isOverdue(soa) ? PAYMENT_STATUS.OVERDUE : PAYMENT_STATUS.UNPAID;

    return BillingSOARepository.updateById(soaId, { amountPaid, remainingBalance, paymentStatus });
  }

  _isOverdue(soa) {
    return soa.dueDate && soa.dueDate.getTime() < Date.now() && soa.remainingBalance > 0;
  }

  /** Self-healing overdue flag — flips on read rather than requiring a dedicated cron job. */
  async _withFreshOverdueStatus(soa) {
    if (!soa) return soa;
    if ((soa.paymentStatus === PAYMENT_STATUS.UNPAID || soa.paymentStatus === PAYMENT_STATUS.PARTIAL) && this._isOverdue(soa)) {
      return BillingSOARepository.updateById(soa._id, { paymentStatus: PAYMENT_STATUS.OVERDUE });
    }
    return soa;
  }

  async listForRequester(requester) {
    if (requester.role === ROLES.TENANT) {
      const soas = await BillingSOARepository.findByTenant(requester.id);
      return Promise.all(soas.map((s) => this._withFreshOverdueStatus(s)));
    }
    if (requester.role === ROLES.LANDLORD) {
      const properties = await PropertyRepository.findByLandlord(requester.id);
      const rooms = await RoomRepository.find({ propertyId: { $in: properties.map((p) => p._id) } });
      const soas = await BillingSOARepository.findByRoomIds(rooms.map((r) => r._id));
      return Promise.all(soas.map((s) => this._withFreshOverdueStatus(s)));
    }
    if (requester.role === ROLES.CARETAKER) {
      // Caretakers "review" billing for rooms they're assigned to, via reservations.
      const ReservationRepository = require('../repositories/ReservationRepository');
      const assigned = await ReservationRepository.findByCaretaker(requester.id);
      // findByCaretaker populates roomId, so read the id off the populated room.
      const roomIds = [...new Set(assigned.map((r) => String(r.roomId?._id ?? r.roomId)))];
      const soas = await BillingSOARepository.findByRoomIds(roomIds);
      return Promise.all(soas.map((s) => this._withFreshOverdueStatus(s)));
    }
    if (requester.role === ROLES.ADMIN) {
      const soas = await BillingSOARepository.find({}, { sort: { billingPeriod: -1 } });
      return Promise.all(soas.map((s) => this._withFreshOverdueStatus(s)));
    }
    return [];
  }

  async getByIdForRequester(soaId, requester) {
    const soa = await BillingSOARepository.findById(soaId);
    if (!soa) throw ApiError.notFound('Statement of account not found', 'SOA_NOT_FOUND');

    if (requester.role === ROLES.ADMIN) return this._withFreshOverdueStatus(soa);
    if (requester.role === ROLES.TENANT && String(soa.tenantId) === String(requester.id)) return this._withFreshOverdueStatus(soa);

    if (requester.role === ROLES.LANDLORD || requester.role === ROLES.CARETAKER) {
      const room = await RoomRepository.findById(soa.roomId);
      const property = await PropertyRepository.findById(room.propertyId);
      const isLandlordOwner = requester.role === ROLES.LANDLORD && String(property.landlordId) === String(requester.id);
      const isAssignedCaretaker = requester.role === ROLES.CARETAKER && property.caretakerIds.some((id) => String(id) === String(requester.id));
      if (isLandlordOwner || isAssignedCaretaker) return this._withFreshOverdueStatus(soa);
    }

    throw ApiError.forbidden('You do not have access to this statement of account', 'FORBIDDEN_SOA_ACCESS');
  }
}

module.exports = new BillingService();
