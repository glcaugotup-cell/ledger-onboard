const BaseRepository = require('./BaseRepository');
const UtilityReading = require('../models/UtilityReading');

class UtilityReadingRepository extends BaseRepository {
  constructor() {
    super(UtilityReading);
  }

  findByRoomAndMonth(roomId, readingMonth) {
    return this.model.findOne({ roomId, readingMonth }).exec();
  }

  findByRoom(roomId) {
    return this.model.find({ roomId }).sort({ readingMonth: -1 }).exec();
  }

  findByCaretaker(caretakerId) {
    return this.model.find({ caretakerId }).sort({ readingMonth: -1 }).exec();
  }
}

module.exports = new UtilityReadingRepository();
