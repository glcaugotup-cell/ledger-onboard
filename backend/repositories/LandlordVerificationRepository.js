const BaseRepository = require('./BaseRepository');
const LandlordVerification = require('../models/LandlordVerification');

class LandlordVerificationRepository extends BaseRepository {
  constructor() {
    super(LandlordVerification);
  }

  findLatestByLandlord(landlordId) {
    return this.model.findOne({ landlordId }).sort({ createdAt: -1 }).exec();
  }

  /** Applies the update only while the landlord's submission is still pending; null otherwise. */
  updatePendingOfLandlord(id, landlordId, update) {
    return this.model.findOneAndUpdate({ _id: id, landlordId, status: 'PENDING' }, update, { new: true, runValidators: true }).exec();
  }

  findPending() {
    return this.model.find({ status: 'PENDING' }).sort({ submittedAt: 1 }).populate('landlordId', 'fullName email phone').exec();
  }
}

module.exports = new LandlordVerificationRepository();
