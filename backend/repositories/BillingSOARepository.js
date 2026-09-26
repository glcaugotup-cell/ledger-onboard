const BaseRepository = require('./BaseRepository');
const BillingSOA = require('../models/BillingSOA');

class BillingSOARepository extends BaseRepository {
  constructor() {
    super(BillingSOA);
  }

  findByTenant(tenantId) {
    return this.model.find({ tenantId }).sort({ billingPeriod: -1 }).exec();
  }

  findByTenantAndPeriod(tenantId, billingPeriod) {
    return this.model.findOne({ tenantId, billingPeriod }).exec();
  }

  findMostRecentByTenant(tenantId) {
    return this.model.findOne({ tenantId }).sort({ billingPeriod: -1 }).exec();
  }

  findByRoomIds(roomIds, filter = {}) {
    return this.model.find({ roomId: { $in: roomIds }, ...filter }).sort({ billingPeriod: -1 }).exec();
  }

  /** Unpaid/partial bills with a balance, due after `from` and on or before `to` (optionally one tenant's). */
  findDueBetween(from, to, { tenantId } = {}) {
    const filter = { paymentStatus: { $in: ['UNPAID', 'PARTIAL'] }, remainingBalance: { $gt: 0 }, dueDate: { $gt: from, $lte: to } };
    if (tenantId) filter.tenantId = tenantId;
    return this.model.find(filter).exec();
  }

  /**
   * Atomically marks a reminder stage as sent. Returns the bill only for the one caller
   * that flipped it, so concurrent sweeps can't send the same reminder twice.
   */
  claimReminder(soaId, stage, at) {
    const field = `reminders.${stage}SentAt`;
    return this.model.findOneAndUpdate({ _id: soaId, [field]: null }, { $set: { [field]: at } }, { new: true }).exec();
  }

  findUnpaidOrOverdueByRoomIds(roomIds) {
    return this.model
      .find({ roomId: { $in: roomIds }, paymentStatus: { $in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } })
      .exec();
  }
}

module.exports = new BillingSOARepository();
