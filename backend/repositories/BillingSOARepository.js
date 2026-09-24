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

  findUnpaidOrOverdueByRoomIds(roomIds) {
    return this.model
      .find({ roomId: { $in: roomIds }, paymentStatus: { $in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } })
      .exec();
  }
}

module.exports = new BillingSOARepository();
