const RoomRepository = require('../repositories/RoomRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const ApiError = require('../utils/ApiError');
const { ROLES, ROOM_STATUS } = require('../utils/constants');

class RoomService {
  async listByProperty(propertyId) {
    return RoomRepository.findByProperty(propertyId);
  }

  async listAvailableByProperty(propertyId) {
    return RoomRepository.findAvailableByProperty(propertyId);
  }

  async create(propertyId, requester, data) {
    const property = await PropertyRepository.findById(propertyId);
    if (!property || property.deletedAt) throw ApiError.notFound('Property not found', 'PROPERTY_NOT_FOUND');
    this._assertLandlordOwnsOrAdmin(property, requester);

    return RoomRepository.create({
      propertyId,
      roomNumber: data.roomNumber,
      description: data.description,
      capacity: data.capacity,
      monthlyBaseRent: data.monthlyBaseRent,
      amenities: data.amenities || [],
      currentOccupancy: 0,
      status: ROOM_STATUS.AVAILABLE,
    });
  }

  async update(roomId, requester, updates) {
    const room = await RoomRepository.findById(roomId);
    if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    const property = await PropertyRepository.findById(room.propertyId);
    if (!property || property.deletedAt) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    this._assertLandlordOwnsOrAdmin(property, requester);

    const allowed = ['roomNumber', 'description', 'capacity', 'monthlyBaseRent', 'amenities', 'status'];
    const safeUpdates = {};
    for (const key of allowed) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }
    return RoomRepository.updateById(roomId, safeUpdates);
  }

  /** Occupies a room by 1 tenant; flips to 'occupied' once at capacity. Never exceeds capacity. */
  async occupyOneSlot(roomId) {
    const room = await RoomRepository.findById(roomId);
    if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    if (room.currentOccupancy >= room.capacity) {
      throw ApiError.conflict('This room is already at full capacity', 'ROOM_FULL');
    }
    const nextOccupancy = room.currentOccupancy + 1;
    return RoomRepository.updateById(roomId, {
      currentOccupancy: nextOccupancy,
      status: nextOccupancy >= room.capacity ? ROOM_STATUS.OCCUPIED : ROOM_STATUS.AVAILABLE,
    });
  }

  /** Frees one occupancy slot (move-out/cancellation), never dropping below 0. */
  async freeOneSlot(roomId) {
    const room = await RoomRepository.findById(roomId);
    if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    const nextOccupancy = Math.max(0, room.currentOccupancy - 1);
    return RoomRepository.updateById(roomId, {
      currentOccupancy: nextOccupancy,
      status: nextOccupancy < room.capacity && room.status !== ROOM_STATUS.MAINTENANCE ? ROOM_STATUS.AVAILABLE : room.status,
    });
  }

  _assertLandlordOwnsOrAdmin(property, requester) {
    if (requester.role === ROLES.ADMIN) return;
    if (requester.role === ROLES.LANDLORD && String(property.landlordId) === String(requester.id)) return;
    throw ApiError.forbidden('You do not have access to this property', 'NOT_PROPERTY_OWNER');
  }
}

module.exports = new RoomService();
