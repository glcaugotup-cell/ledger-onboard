const BaseRepository = require('./BaseRepository');
const StudentVerification = require('../models/StudentVerification');

class StudentVerificationRepository extends BaseRepository {
  constructor() {
    super(StudentVerification);
  }

  findLatestByTenant(tenantId) {
    return this.model.findOne({ tenantId }).sort({ createdAt: -1 }).exec();
  }

  /** Applies the update only while the student's submission is still pending; null otherwise. */
  updatePendingOfTenant(id, tenantId, update) {
    return this.model.findOneAndUpdate({ _id: id, tenantId, status: 'PENDING' }, update, { new: true, runValidators: true }).exec();
  }

  /** Applies the review only while the submission is still pending, so two admins can't both decide; null otherwise. */
  updatePending(id, update) {
    return this.model.findOneAndUpdate({ _id: id, status: 'PENDING' }, update, { new: true, runValidators: true }).exec();
  }

  findPending() {
    return this.model.find({ status: 'PENDING' }).sort({ submittedAt: 1 }).populate('tenantId', 'fullName email phone').exec();
  }
}

module.exports = new StudentVerificationRepository();
