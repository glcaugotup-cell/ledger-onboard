const BaseRepository = require('./BaseRepository');
const PaymentTransaction = require('../models/PaymentTransaction');

class PaymentTransactionRepository extends BaseRepository {
  constructor() {
    super(PaymentTransaction);
  }

  findBySOA(soaId) {
    return this.model.find({ soaId }).sort({ createdAt: -1 }).exec();
  }

  findByTenant(tenantId) {
    return this.model.find({ tenantId }).sort({ createdAt: -1 }).exec();
  }

  findPendingForRoomIds(roomIds) {
    return this.model
      .find({ verificationStatus: 'PENDING' })
      .populate({ path: 'soaId', match: { roomId: { $in: roomIds } } })
      .exec()
      .then((rows) => rows.filter((r) => r.soaId));
  }

  findPending() {
    return this.model.find({ verificationStatus: 'PENDING' }).sort({ createdAt: 1 }).exec();
  }

  sumVerifiedAmountByTenant(tenantId) {
    return this.model.aggregate([
      { $match: { tenantId, verificationStatus: 'VERIFIED' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
  }
}

module.exports = new PaymentTransactionRepository();
