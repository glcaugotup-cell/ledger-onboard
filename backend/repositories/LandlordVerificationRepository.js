const BaseRepository = require('./BaseRepository');
const LandlordVerification = require('../models/LandlordVerification');

class LandlordVerificationRepository extends BaseRepository {
  constructor() {
    super(LandlordVerification);
  }

  findLatestByLandlord(landlordId) {
    return this.model.findOne({ landlordId }).sort({ createdAt: -1 }).exec();
  }

  findPending() {
    return this.model.find({ status: 'PENDING' }).sort({ submittedAt: 1 }).populate('landlordId', 'fullName email phone').exec();
  }
}

module.exports = new LandlordVerificationRepository();
