const ReservationRepository = require('../repositories/ReservationRepository');
const RoomRepository = require('../repositories/RoomRepository');
const PropertyRepository = require('../repositories/PropertyRepository');
const UserRepository = require('../repositories/UserRepository');
const AuditLogRepository = require('../repositories/AuditLogRepository');
const BillingSOARepository = require('../repositories/BillingSOARepository');
const RoomService = require('./RoomService');
const NotificationService = require('./NotificationService');
const EmailService = require('./EmailService');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { roundMoney } = require('../utils/money');
const { appDateKey, inputDateKey, addDaysToKey, formatDateKey } = require('../utils/dates');
const { ACCOUNT_STATUS, ROLES, RESERVATION_STATUS, RESERVATION_TRANSITIONS, ROOM_STATUS, PAYMENT_STATUS } = require('../utils/constants');

// Section 2 recommendation: a landlord cannot confirm a move-in until tenants have a GCash QR to pay with.
// Set to false to remove the gate.
const REQUIRE_LANDLORD_QR_FOR_MOVE_IN = true;

const AUTO_CANCEL_REASON = 'Cancelled automatically: the tenant moved in to another place.';

const links = {
  tenantReservation: (id) => `/tenant/reservations?reservation=${id}`,
  tenantApartment: () => '/tenant/apartment',
  tenantReview: (id) => `/tenant/reservations?review=${id}`,
  landlordProperty: (propertyId, id) => `/landlord/properties/${propertyId}?reservation=${id}#tenants`,
  caretakerRooms: () => '/caretaker/rooms',
};

const idOf = (value) => String(value?._id || value || '');

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
      link: links.landlordProperty(property._id, reservation._id),
    });

    return reservation;
  }

  async listForRequester(requester) {
    switch (requester.role) {
      case ROLES.TENANT:
        return this._withTenantContacts(await ReservationRepository.findByTenant(requester.id));
      case ROLES.LANDLORD: {
        const properties = await PropertyRepository.findByLandlord(requester.id);
        return this._withBalances(await ReservationRepository.findByLandlordProperties(properties.map((p) => p._id)));
      }
      case ROLES.CARETAKER:
        return ReservationRepository.findByCaretaker(requester.id);
      case ROLES.ADMIN:
        return this._withBalances(await ReservationRepository.find({}, { populate: 'tenantId roomId propertyId', sort: { createdAt: -1 } }));
      default:
        return [];
    }
  }

  async updateStatus(reservationId, requester, { status, rejectionReason, caretakerAssignedId, reason }) {
    const reservation = await ReservationRepository.findById(reservationId);
    if (!reservation) throw ApiError.notFound('Reservation not found', 'RESERVATION_NOT_FOUND');

    const property = await PropertyRepository.findById(reservation.propertyId);
    const isOwner = requester.role === ROLES.LANDLORD && String(property.landlordId) === String(requester.id);
    const isAdmin = requester.role === ROLES.ADMIN;
    const isOwnTenant = requester.role === ROLES.TENANT && String(reservation.tenantId) === String(requester.id);

    if (isOwnTenant) {
      // A tenant may only withdraw a pending or reserved request; a current stay ends through a leave request.
      if (status !== RESERVATION_STATUS.CANCELLED) {
        throw ApiError.forbidden('You do not have permission to update this reservation', 'FORBIDDEN_RESERVATION_UPDATE');
      }
      if (reservation.status === RESERVATION_STATUS.ACTIVE) {
        throw ApiError.badRequest('A current stay cannot be cancelled. Use "Request to leave" in My Apartment instead.', 'USE_LEAVE_REQUEST');
      }
    } else if (!isOwner && !isAdmin) {
      throw ApiError.forbidden('You do not have permission to update this reservation', 'FORBIDDEN_RESERVATION_UPDATE');
    }

    const allowedNext = RESERVATION_TRANSITIONS[reservation.status] || [];
    if (!allowedNext.includes(status)) {
      throw ApiError.badRequest(`Cannot transition reservation from ${reservation.status} to ${status}`, 'INVALID_STATUS_TRANSITION');
    }

    const now = new Date();
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
      updates.approvedAt = now;
      // Approval holds one slot so nobody else can take it before the tenant arrives.
      await RoomService.occupyOneSlot(reservation.roomId);
    }

    if (status === RESERVATION_STATUS.REJECTED) {
      updates.rejectionReason = rejectionReason || 'Not specified';
    }

    if (status === RESERVATION_STATUS.CANCELLED) {
      updates.cancelledAt = now;
      updates.cancelledBy = requester.role;
      updates.cancellationReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
    }

    if (status === RESERVATION_STATUS.ACTIVE) {
      if (REQUIRE_LANDLORD_QR_FOR_MOVE_IN) {
        const landlord = await UserRepository.findById(property.landlordId);
        if (!landlord?.paymentQrUrl) {
          throw ApiError.conflict('Upload your GCash QR code in Account before confirming a move-in, so the tenant can pay their bills.', 'LANDLORD_QR_REQUIRED');
        }
      }
      const otherStay = await ReservationRepository.findCurrentStayForTenant(reservation.tenantId, { excludeId: reservation._id });
      if (otherStay) {
        throw ApiError.conflict('This tenant still has a current stay somewhere else. They must move out there first.', 'TENANT_HAS_CURRENT_STAY');
      }
      // The held slot simply becomes the occupied slot: the room's count does not change.
      updates.movedInAt = now;
    }

    if (status === RESERVATION_STATUS.NO_SHOW) {
      const holdUntil = this._holdUntilKey(reservation);
      if (appDateKey(now) <= holdUntil) {
        throw ApiError.badRequest(`The room is held until ${formatDateKey(holdUntil)}. You can mark a no-show after that date.`, 'NO_SHOW_TOO_EARLY');
      }
      updates.noShowAt = now;
    }

    if (status === RESERVATION_STATUS.COMPLETED) {
      updates.movedOutAt = now;
    }

    // Cancel, no-show and move-out release the slot that approval held.
    if ([RESERVATION_STATUS.CANCELLED, RESERVATION_STATUS.NO_SHOW, RESERVATION_STATUS.COMPLETED].includes(status)
      && [RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.ACTIVE].includes(reservation.status)) {
      await RoomService.freeOneSlot(reservation.roomId);
    }

    const updated = await ReservationRepository.updateById(reservationId, updates);
    const room = await RoomRepository.findById(reservation.roomId);
    const place = `${property.propertyName}, Room ${room?.roomNumber || ''}`.trim();

    await this._notifyStatusChange({ reservation: updated, previousStatus: reservation.status, property, place, requester });

    if (status === RESERVATION_STATUS.APPROVED) await this._sendApprovalEmail(updated, property, room);
    if (status === RESERVATION_STATUS.ACTIVE) await this._cancelOtherRequests(updated);

    await AuditLogRepository.record({
      action: `RESERVATION_${status.toUpperCase()}`,
      actorId: requester.id,
      actorRole: requester.role,
      targetType: 'Reservation',
      targetId: reservation._id,
      metadata: { from: reservation.status, to: status },
    });

    return updated;
  }

  async reassignCaretaker(reservationId, requester, caretakerId) {
    const reservation = await ReservationRepository.findById(reservationId);
    if (!reservation || ![RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.ACTIVE].includes(reservation.status)) {
      throw ApiError.notFound('Current tenancy not found', 'TENANCY_NOT_FOUND');
    }
    const property = await PropertyRepository.findById(reservation.propertyId);
    if (requester.role !== ROLES.ADMIN && (requester.role !== ROLES.LANDLORD || String(property?.landlordId) !== String(requester.id))) {
      throw ApiError.forbidden('You do not manage this tenancy', 'FORBIDDEN_RESERVATION_UPDATE');
    }
    const caretaker = await UserRepository.findById(caretakerId);
    if (!caretaker || caretaker.role !== ROLES.CARETAKER || caretaker.accountStatus !== ACCOUNT_STATUS.ACTIVE || String(caretaker.assignedLandlordId) !== String(property.landlordId)) {
      throw ApiError.badRequest('Choose an active caretaker who works for you', 'INVALID_CARETAKER');
    }
    return ReservationRepository.updateById(reservationId, { caretakerAssignedId: caretakerId });
  }

  /** Tenant asks to end their current stay. */
  async requestLeave(reservationId, tenantId, { note } = {}) {
    const reservation = await ReservationRepository.findById(reservationId);
    if (!reservation || String(reservation.tenantId) !== String(tenantId)) throw ApiError.notFound('Reservation not found', 'RESERVATION_NOT_FOUND');
    if (reservation.status !== RESERVATION_STATUS.ACTIVE) {
      throw ApiError.badRequest('You can only request to leave a current stay.', 'NOT_A_CURRENT_STAY');
    }
    if (reservation.leaveRequest?.status === 'pending') {
      throw ApiError.conflict('Your request to leave is already waiting for the landlord.', 'LEAVE_REQUEST_PENDING');
    }
    const updated = await ReservationRepository.updateById(reservationId, {
      leaveRequest: { status: 'pending', requestedAt: new Date(), note: (note || '').trim(), decidedAt: null, declineReason: null, balanceAtDecision: null },
    });
    const property = await PropertyRepository.findById(reservation.propertyId);
    const room = await RoomRepository.findById(reservation.roomId);
    const tenant = await UserRepository.findById(tenantId);
    await NotificationService.notify({
      userId: property.landlordId,
      type: 'LEAVE_REQUESTED',
      title: 'Request to leave',
      message: `${tenant?.fullName || 'A tenant'} asked to leave ${property.propertyName}, Room ${room?.roomNumber || ''}.`,
      relatedType: 'Reservation',
      relatedId: reservation._id,
      link: links.landlordProperty(property._id, reservation._id),
    });
    await AuditLogRepository.record({ action: 'LEAVE_REQUESTED', actorId: tenantId, actorRole: ROLES.TENANT, targetType: 'Reservation', targetId: reservation._id });
    return updated;
  }

  /** Landlord approves (then marks moved out) or declines a tenant's request to leave. */
  async decideLeave(reservationId, requester, { decision, reason, acknowledgeBalance }) {
    const reservation = await ReservationRepository.findById(reservationId);
    if (!reservation) throw ApiError.notFound('Reservation not found', 'RESERVATION_NOT_FOUND');
    const property = await PropertyRepository.findById(reservation.propertyId);
    if (requester.role !== ROLES.ADMIN && (requester.role !== ROLES.LANDLORD || String(property?.landlordId) !== String(requester.id))) {
      throw ApiError.forbidden('You do not manage this tenancy', 'FORBIDDEN_RESERVATION_UPDATE');
    }
    if (reservation.status !== RESERVATION_STATUS.ACTIVE || reservation.leaveRequest?.status !== 'pending') {
      throw ApiError.badRequest('There is no pending request to leave for this tenancy.', 'NO_PENDING_LEAVE_REQUEST');
    }

    const balance = await this._tenancyBalance(reservation);
    const leaveRequest = { ...reservation.toObject().leaveRequest, decidedAt: new Date(), balanceAtDecision: balance };
    if (decision === 'approve') {
      // The balance is never erased; approving with one just needs an explicit confirmation.
      if (balance > 0 && acknowledgeBalance !== true) {
        throw new ApiError(409, 'BALANCE_ACKNOWLEDGEMENT_REQUIRED', `This tenant still owes ₱${balance.toLocaleString('en-PH')}. Confirm that you want to approve the request anyway.`, { balance });
      }
      leaveRequest.status = 'approved';
      leaveRequest.declineReason = null;
    } else {
      const trimmed = typeof reason === 'string' ? reason.trim() : '';
      if (trimmed.length < 3 || trimmed.length > 500) {
        throw ApiError.badRequest('Please give a reason for declining (3 to 500 characters).', 'REASON_REQUIRED');
      }
      leaveRequest.status = 'declined';
      leaveRequest.declineReason = trimmed;
    }

    const updated = await ReservationRepository.updateById(reservationId, { leaveRequest });
    await NotificationService.notify({
      userId: reservation.tenantId,
      type: decision === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_DECLINED',
      title: decision === 'approve' ? 'Request to leave approved' : 'Request to leave declined',
      message: decision === 'approve'
        ? `Your landlord approved your request to leave ${property.propertyName}.${balance > 0 ? ` Your remaining balance of ₱${balance.toLocaleString('en-PH')} stays on record.` : ''}`
        : `Your landlord declined your request to leave: ${leaveRequest.declineReason}`,
      relatedType: 'Reservation',
      relatedId: reservation._id,
      link: links.tenantApartment(),
    });
    await AuditLogRepository.record({
      action: decision === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_DECLINED',
      actorId: requester.id,
      actorRole: requester.role,
      targetType: 'Reservation',
      targetId: reservation._id,
      metadata: { balance },
    });
    return updated;
  }

  /** "YYYY-MM-DD" of the last day the reserved slot is held (move-in date plus the grace period). */
  _holdUntilKey(reservation) {
    return addDaysToKey(inputDateKey(reservation.moveInDate), env.noShowGraceDays);
  }

  /** What the tenant still owes for this tenancy: the latest bill carries any unpaid arrears forward. */
  async _tenancyBalance(reservation) {
    const [mostRecent] = await BillingSOARepository.find(
      { tenantId: idOf(reservation.tenantId), roomId: idOf(reservation.roomId) },
      { sort: { billingPeriod: -1 }, limit: 1 }
    );
    if (!mostRecent || mostRecent.paymentStatus === PAYMENT_STATUS.PAID) return 0;
    return roundMoney(mostRecent.remainingBalance || 0);
  }

  /**
   * Landlord/admin lists: reserved stays carry the last held day (when a no-show can be marked),
   * current stays the tenant's outstanding balance (for leave requests and move-out).
   */
  async _withBalances(reservations) {
    return Promise.all(reservations.map(async (reservation) => {
      const plain = typeof reservation.toObject === 'function' ? reservation.toObject() : { ...reservation };
      if (plain.status === RESERVATION_STATUS.APPROVED) return { ...plain, holdUntil: this._holdUntilKey(plain), today: appDateKey() };
      if (plain.status !== RESERVATION_STATUS.ACTIVE) return plain;
      return { ...plain, outstandingBalance: await this._tenancyBalance(reservation) };
    }));
  }

  /**
   * Tenant lists: the landlord's name on every card, and full contact details (and the
   * caretaker's) only once the reservation is approved. Public property endpoints never expose them.
   */
  async _withTenantContacts(reservations) {
    if (!reservations.length) return reservations;
    const landlordIds = [...new Set(reservations.map((r) => idOf(r.propertyId?.landlordId)).filter(Boolean))];
    const caretakerIds = [...new Set(reservations.map((r) => idOf(r.caretakerAssignedId)).filter(Boolean))];
    const [landlords, caretakers] = await Promise.all([
      landlordIds.length ? UserRepository.find({ _id: { $in: landlordIds } }, { select: '_id fullName email phone' }) : [],
      caretakerIds.length ? UserRepository.find({ _id: { $in: caretakerIds } }, { select: '_id fullName phone' }) : [],
    ]);
    const landlordById = new Map(landlords.map((l) => [String(l._id), l]));
    const caretakerById = new Map(caretakers.map((c) => [String(c._id), c]));
    return reservations.map((reservation) => {
      const plain = typeof reservation.toObject === 'function' ? reservation.toObject() : { ...reservation };
      const landlord = landlordById.get(idOf(plain.propertyId?.landlordId));
      const caretaker = caretakerById.get(idOf(plain.caretakerAssignedId));
      const shareContacts = [RESERVATION_STATUS.APPROVED, RESERVATION_STATUS.ACTIVE].includes(plain.status);
      return {
        ...plain,
        landlordContact: landlord ? (shareContacts ? { fullName: landlord.fullName, email: landlord.email, phone: landlord.phone || null } : { fullName: landlord.fullName }) : null,
        caretakerContact: shareContacts && caretaker ? { fullName: caretaker.fullName, phone: caretaker.phone || null } : null,
        holdUntil: plain.status === RESERVATION_STATUS.APPROVED ? this._holdUntilKey(plain) : null,
      };
    });
  }

  async _notifyStatusChange({ reservation, previousStatus, property, place, requester }) {
    const base = { relatedType: 'Reservation', relatedId: reservation._id };
    const tenantLink = links.tenantReservation(reservation._id);
    const notify = (payload) => NotificationService.notify({ ...base, ...payload });

    switch (reservation.status) {
      case RESERVATION_STATUS.APPROVED:
        await notify({
          userId: reservation.tenantId,
          type: 'RESERVATION_APPROVED',
          title: 'Reservation approved',
          message: `Your reservation for ${place} is approved. You may move in on ${formatDateKey(inputDateKey(reservation.moveInDate))}.`,
          link: tenantLink,
        });
        break;
      case RESERVATION_STATUS.REJECTED:
        await notify({ userId: reservation.tenantId, type: 'RESERVATION_REJECTED', title: 'Reservation rejected', message: `Your reservation for ${place} was rejected: ${reservation.rejectionReason}`, link: tenantLink });
        break;
      case RESERVATION_STATUS.CANCELLED:
        if (requester.role === ROLES.TENANT) {
          await notify({ userId: property.landlordId, type: 'RESERVATION_CANCELLED', title: 'Reservation cancelled', message: `A tenant cancelled their ${previousStatus === RESERVATION_STATUS.APPROVED ? 'reserved' : 'pending'} request for ${place}.`, link: links.landlordProperty(property._id, reservation._id) });
        } else {
          await notify({ userId: reservation.tenantId, type: 'RESERVATION_CANCELLED', title: 'Reservation cancelled', message: `Your reservation for ${place} was cancelled by the landlord.${reservation.cancellationReason ? ` Reason: ${reservation.cancellationReason}` : ''}`, link: tenantLink });
        }
        break;
      case RESERVATION_STATUS.ACTIVE:
        await notify({ userId: reservation.tenantId, type: 'RESERVATION_MOVED_IN', title: 'Move-in confirmed', message: `Welcome to ${place}. Your bills and maintenance requests are now in My Apartment.`, link: links.tenantApartment() });
        if (reservation.caretakerAssignedId) {
          await notify({ userId: reservation.caretakerAssignedId, type: 'RESERVATION_MOVED_IN', title: 'Tenant moved in', message: `A tenant moved in to ${place}.`, link: links.caretakerRooms() });
        }
        break;
      case RESERVATION_STATUS.NO_SHOW:
        await notify({ userId: reservation.tenantId, type: 'RESERVATION_NO_SHOW', title: 'Reservation marked as no-show', message: `You did not arrive at ${place} within the hold period, so the room was released.`, link: tenantLink });
        if (reservation.caretakerAssignedId) {
          await notify({ userId: reservation.caretakerAssignedId, type: 'RESERVATION_NO_SHOW', title: 'Tenant did not arrive', message: `The reserved tenant for ${place} was marked as a no-show.`, link: links.caretakerRooms() });
        }
        break;
      case RESERVATION_STATUS.COMPLETED:
        await notify({ userId: reservation.tenantId, type: 'RESERVATION_COMPLETED', title: 'Moved out', message: `Your stay at ${place} has ended. Your bills and issues stay available in My Apartment.`, link: links.tenantApartment() });
        await notify({ userId: reservation.tenantId, type: 'REVIEW_PROMPT', title: 'Rate your stay', message: `How was your stay at ${place}? Leave a rating to help other tenants.`, link: links.tenantReview(reservation._id) });
        break;
      default:
        break;
    }
  }

  /** R7: approval email with the landlord's (and caretaker's) contact details. Email trouble never undoes the approval. */
  async _sendApprovalEmail(reservation, property, room) {
    try {
      const [tenant, landlord, caretaker] = await Promise.all([
        UserRepository.findById(reservation.tenantId),
        UserRepository.findById(property.landlordId),
        reservation.caretakerAssignedId ? UserRepository.findById(reservation.caretakerAssignedId) : null,
      ]);
      if (!tenant) return;
      await EmailService.sendReservationApprovedEmail(tenant.email, {
        tenantName: tenant.firstName || tenant.fullName,
        propertyName: property.propertyName,
        location: [property.address?.street, property.address?.barangay, property.address?.city].filter(Boolean).join(', '),
        roomNumber: room?.roomNumber || '',
        moveInDate: formatDateKey(inputDateKey(reservation.moveInDate)),
        holdUntil: formatDateKey(this._holdUntilKey(reservation)),
        landlord: landlord ? { name: landlord.fullName, email: landlord.email, phone: landlord.phone || '' } : null,
        caretaker: caretaker ? { name: caretaker.fullName, phone: caretaker.phone || '' } : null,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[EmailService] Reservation approval email failed:', err.message);
    }
  }

  /** R3: once a tenant moves in, their other pending or reserved requests are cancelled (never deleted). */
  async _cancelOtherRequests(reservation) {
    const others = await ReservationRepository.findOpenRequestsForTenant(reservation.tenantId, { excludeId: reservation._id });
    for (const other of others) {
      /* eslint-disable no-await-in-loop */
      if (other.status === RESERVATION_STATUS.APPROVED) await RoomService.freeOneSlot(idOf(other.roomId));
      await ReservationRepository.updateById(other._id, {
        status: RESERVATION_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: 'system',
        cancellationReason: AUTO_CANCEL_REASON,
      });
      const place = `${other.propertyId?.propertyName || 'a property'}, Room ${other.roomId?.roomNumber || ''}`.trim();
      if (other.propertyId?.landlordId) {
        await NotificationService.notify({
          userId: other.propertyId.landlordId,
          type: 'RESERVATION_AUTO_CANCELLED',
          title: 'Reservation cancelled automatically',
          message: `A request for ${place} was cancelled because the tenant moved in somewhere else.`,
          relatedType: 'Reservation',
          relatedId: other._id,
          link: links.landlordProperty(idOf(other.propertyId), other._id),
        });
      }
      await NotificationService.notify({
        userId: reservation.tenantId,
        type: 'RESERVATION_AUTO_CANCELLED',
        title: 'Other request cancelled',
        message: `Your request for ${place} was cancelled because you moved in to another place.`,
        relatedType: 'Reservation',
        relatedId: other._id,
        link: links.tenantReservation(other._id),
      });
      await AuditLogRepository.record({ action: 'RESERVATION_AUTO_CANCELLED', actorRole: 'system', targetType: 'Reservation', targetId: other._id, metadata: { movedInReservationId: String(reservation._id) } });
      /* eslint-enable no-await-in-loop */
    }
  }
}

module.exports = new ReservationService();
