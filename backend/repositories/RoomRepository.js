const BaseRepository = require('./BaseRepository');
const Room = require('../models/Room');

class RoomRepository extends BaseRepository {
  constructor() {
    super(Room);
  }

  findByProperty(propertyId) {
    return this.model.find({ propertyId }).sort({ roomNumber: 1 }).exec();
  }

  findAvailableByProperty(propertyId) {
    return this.model.find({ propertyId, status: 'available' }).sort({ roomNumber: 1 }).exec();
  }

  /** Cheapest monthlyBaseRent per property: [{ _id: propertyId, startingRent }]. */
  minRentByProperty(propertyIds) {
    return this.model.aggregate([
      { $match: { propertyId: { $in: propertyIds } } },
      { $group: { _id: '$propertyId', startingRent: { $min: '$monthlyBaseRent' } } },
    ]);
  }

  countByStatusForLandlordProperties(propertyIds) {
    return this.model.aggregate([
      { $match: { propertyId: { $in: propertyIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
  }

  incrementOccupancy(roomId, delta, session = undefined) {
    return this.model
      .findByIdAndUpdate(
        roomId,
        [
          {
            $set: {
              currentOccupancy: { $add: ['$currentOccupancy', delta] },
            },
          },
        ],
        { new: true, session }
      )
      .exec();
  }
}

module.exports = new RoomRepository();
