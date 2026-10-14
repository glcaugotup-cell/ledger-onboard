const RoomRepository = require('../repositories/RoomRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const ReservationRepository = require('../repositories/ReservationRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const NotificationService = require('./NotificationService');
const ApiError = require('../utils/ApiError');
const { RESERVATION_STATUS, ROLES, ROOM_STATUS } = require('../utils/constants');

const peso = (amount) => `₱${Number(amount).toLocaleString('en-PH')}`;

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

    try {
      return await RoomRepository.create({
        propertyId,
        roomNumber: data.roomNumber,
        description: data.description,
        capacity: data.capacity,
        monthlyBaseRent: data.monthlyBaseRent,
        amenities: data.amenities || [],
        currentOccupancy: 0,
        status: ROOM_STATUS.AVAILABLE,
      });
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict('A room with this number already exists in this property.', 'ROOM_NUMBER_EXISTS');
      throw err;
    }
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
    if (safeUpdates.status === ROOM_STATUS.AVAILABLE && room.currentOccupancy >= room.capacity) {
      throw ApiError.conflict('This room is full. Complete or cancel a tenancy before marking it available.', 'ROOM_IS_FULL');
    }
    const updated = await RoomRepository.updateById(roomId, safeUpdates);
    if (safeUpdates.monthlyBaseRent !== undefined && Number(safeUpdates.monthlyBaseRent) !== Number(room.monthlyBaseRent)) {
      await this._rentChanged(room, updated, property, requester);
    }
    return updated;
  }

  /**
   * Bills already issued keep their amount (each bill copies the rent when it is created); bills
   * issued from now on use the new rent. The change is audited, and tenants holding or staying in
   * the room get an in-app notice.
   */
  async _rentChanged(before, after, property, requester) {
    await AuditLogRepository.record({
      action: 'ROOM_RENT_CHANGED', actorId: requester.id, actorRole: requester.role, targetType: 'Room', targetId: before._id,
      metadata: { from: before.monthlyBaseRent, to: after.monthlyBaseRent },
    });
    const tenancies = await ReservationRepository.find({ roomId: before._id, status: { $in: [RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.ACTIVE] } });
    for (const tenancy of tenancies) {
      // eslint-disable-next-line no-await-in-loop
      await NotificationService.notify({
        userId: tenancy.tenantId,
        type: 'ROOM_RENT_CHANGED',
        title: 'Rent change',
        message: `The rent for ${property.propertyName}, Room ${before.roomNumber} changed from ${peso(before.monthlyBaseRent)} to ${peso(after.monthlyBaseRent)} per month. Bills already issued stay the same; your next bills use the new rent.`,
        relatedType: 'Reservation',
        relatedId: tenancy._id,
        link: '/tenant/apartment',
      });
    }
  }

  async delete(roomId, requester) {
    const room = await RoomRepository.findById(roomId);
    if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    const property = await PropertyRepository.findById(room.propertyId);
    if (!property || property.deletedAt) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');
    this._assertLandlordOwnsOrAdmin(property, requester);

    if (room.currentOccupancy > 0) {
      throw ApiError.conflict('This room still has current occupants. Resolve the tenancies before deleting it.', 'ROOM_HAS_TENANTS');
    }
    const reservations = await ReservationRepository.count({ roomId });
    if (reservations > 0) {
      throw ApiError.conflict('This room has reservation history and cannot be deleted.', 'ROOM_HAS_RESERVATION_HISTORY');
    }

    await RoomRepository.deleteById(roomId);
    return { deleted: true };
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
