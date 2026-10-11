const BaseRepository = require('./BaseRepository');
const User = require('../models/User');

// Every hidden field that auth code needs; normal queries never load these.
const SECRET_FIELDS = [
  '+passwordHash',
  '+otp.codeHash', '+otp.purpose', '+otp.expiresAt', '+otp.attempts',
  '+refreshTokenHash',
  '+mfaTotp.secretEnc', '+mfaTotp.pendingSecretEnc', '+mfaTotp.lastUsedStep',
  '+mfaTotp.backupCodeHashes', '+mfaTotp.failedAttempts', '+mfaTotp.lockedUntil',
].join(' ');

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  findByEmail(email, { withSecrets = false } = {}) {
    const q = this.model.findOne({ email: email.toLowerCase().trim() });
    if (withSecrets) q.select(SECRET_FIELDS);
    return q.exec();
  }

  findByIdWithSecrets(id) {
    return this.model.findById(id).select(SECRET_FIELDS).exec();
  }

  findCaretakersByLandlord(landlordId, filter = {}) {
    return this.model.find({ assignedLandlordId: landlordId, role: 'caretaker', ...filter }).exec();
  }

  findByRole(role, { skip, limit, filter = {} } = {}) {
    let q = this.model.find({ role, ...filter }).sort({ createdAt: -1 });
    if (typeof skip === 'number') q = q.skip(skip);
    if (typeof limit === 'number') q = q.limit(limit);
    return q.exec();
  }

  /** Accounts eligible for the inactivity sweep: active, past their qualifying threshold. */
  findActiveOlderThan(cutoffDate) {
    return this.model
      .find({ accountStatus: 'active', lastActivityAt: { $lte: cutoffDate } })
      .exec();
  }

  findScheduledForArchive(cutoffDate) {
    return this.model
      .find({ accountStatus: 'active', scheduledArchiveAt: { $ne: null, $lte: cutoffDate } })
      .exec();
  }
}

module.exports = new UserRepository();
