const ReservationRepository = require('../repositories/ReservationRepository');
const RoomRepository = require('../repositories/RoomRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const RoomService = require('./RoomService');
const NotificationService = require('./NotificationService');
const ApiError = require('../utils/ApiError');
const { ACCOUNT_STATUS, ROLES, RESERVATION_STATUS, RESERVATION_TRANSITIONS, ROOM_STATUS } = require('../utils/constants');

class ReservationService {
  /** Tenant submits a reservation request for a room. */
  async create(tenantId, { roomId, moveInDate, moveOutDate }) {
    const room = await RoomRepository.findById(roomId);
    if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');

    const property = await PropertyRepository.findById(room.propertyId);
    const landlord = property && (await UserRepository.findById(property.landlordId));
    // Deleted listings are inactive, and a closed landlord account can't answer requests.
    if (!property || property.listingStatus !== 'approved' || property.deletedAt || landlord?.accountStatus !== ACCOUNT_STATUS.ACTIVE) {
      throw ApiError.badRequest('This property is not currently accepting reservations', 'PROPERTY_NOT_AVAILABLE');
    }
    if (room.status !== ROOM_STATUS.AVAILABLE || room.currentOccupancy >= room.capacity) {
      throw ApiError.conflict('This room is not available', 'ROOM_NOT_AVAILABLE');
    }

    const existing = await ReservationRepository.findActiveByTenantAndRoom(tenantId, roomId);
    if (existing) throw ApiError.conflict('You already have an active reservation for this room', 'DUPLICATE_RESERVATION');

    const reservation = await ReservationRepository.create({
      tenantId,
      roomId,
      propertyId: room.propertyId,
      status: RESERVATION_STATUS.PENDING,
      moveInDate,
      moveOutDate: moveOutDate || null,
    });

    await NotificationService.notify({
      userId: property.landlordId,
      type: 'RESERVATION_REQUESTED',
      title: 'New reservation request',
      message: `A tenant requested room ${room.roomNumber} at ${property.propertyName}.`,
      relatedType: 'Reservation',
      relatedId: reservation._id,
    });

    return reservation;
  }

  async listForRequester(requester) {
    switch (requester.role) {
      case ROLES.TENANT:
        return ReservationRepository.findByTenant(requester.id);
      case ROLES.LANDLORD: {
        const properties = await PropertyRepository.findByLandlord(requester.id);
        return ReservationRepository.findByLandlordProperties(properties.map((p) => p._id));
      }
      case ROLES.CARETAKER:
        return ReservationRepository.findByCaretaker(requester.id);
      case ROLES.ADMIN:
        return ReservationRepository.find({}, { populate: 'tenantId roomId propertyId', sort: { createdAt: -1 } });
      default:
        return [];
    }
  }

  async updateStatus(reservationId, requester, { status, rejectionReason, caretakerAssignedId }) {
    const reservation = await ReservationRepository.findById(reservationId);
    if (!reservation) throw ApiError.notFound('Reservation not found', 'RESERVATION_NOT_FOUND');

    const property = await PropertyRepository.findById(reservation.propertyId);
    const isOwner = requester.role === ROLES.LANDLORD && String(property.landlordId) === String(requester.id);
    const isAdmin = requester.role === ROLES.ADMIN;
    const isOwnTenantCancelling = requester.role === ROLES.TENANT && String(reservation.tenantId) === String(requester.id) && status === RESERVATION_STATUS.CANCELLED;

    if (!isOwner && !isAdmin && !isOwnTenantCancelling) {
      throw ApiError.forbidden('You do not have permission to update this reservation', 'FORBIDDEN_RESERVATION_UPDATE');
    }

    const allowedNext = RESERVATION_TRANSITIONS[reservation.status] || [];
    if (!allowedNext.includes(status)) {
      throw ApiError.badRequest(`Cannot transition reservation from ${reservation.status} to ${status}`, 'INVALID_STATUS_TRANSITION');
    }

    const updates = { status };

    if (status === RESERVATION_STATUS.APPROVED) {
      let assignedCaretaker = caretakerAssignedId || null;
      if (assignedCaretaker) {
        const caretaker = await UserRepository.findById(assignedCaretaker);
        if (!caretaker || String(caretaker.assignedLandlordId) !== String(property.landlordId)) {
          throw ApiError.badRequest('Caretaker is not assigned to this landlord', 'INVALID_CARETAKER');
        }
      } else if (property.caretakerIds?.length) {
        assignedCaretaker = property.caretakerIds[0];
      }
      updates.caretakerAssignedId = assignedCaretaker;
      updates.approvedBy = requester.id;
      updates.approvedAt = new Date();
      await RoomService.occupyOneSlot(reservation.roomId);
    }

    if (status === RESERVATION_STATUS.REJECTED) {
      updates.rejectionReason = rejectionReason || 'Not specified';
    }

    if (status === RESERVATION_STATUS.CANCELLED && reservation.status === RESERVATION_STATUS.APPROVED) {
      await RoomService.freeOneSlot(reservation.roomId);
    }

    if (status === RESERVATION_STATUS.COMPLETED) {
      await RoomService.freeOneSlot(reservation.roomId);
    }

    const updated = await ReservationRepository.updateById(reservationId, updates);

    await NotificationService.notify({
      userId: reservation.tenantId,
      type: `RESERVATION_${status.toUpperCase()}`,
      title: `Reservation ${status}`,
      message: `Your reservation request status changed to ${status}.`,
      relatedType: 'Reservation',
      relatedId: reservation._id,
    });

    if (status === RESERVATION_STATUS.APPROVED || status === RESERVATION_STATUS.REJECTED) {
      await AuditLogRepository.record({
        action: status === RESERVATION_STATUS.APPROVED ? 'RESERVATION_APPROVED' : 'RESERVATION_REJECTED',
        actorId: requester.id,
        actorRole: requester.role,
        targetType: 'Reservation',
        targetId: reservation._id,
      });
    }

    return updated;
  }
}

module.exports = new ReservationService();
