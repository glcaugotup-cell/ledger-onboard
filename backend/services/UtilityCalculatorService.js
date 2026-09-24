const UtilityReadingRepository = require('../repositories/UtilityReadingRepository');
const RoomRepository = require('../repositories/RoomRepository');
const ReservationRepository = require('../repositories/ReservationRepository');
const ApiError = require('../utils/ApiError');
const { roundMoney, safeDivide } = require('../utils/money');

/**
 * Utility-splitting formulas and the caretaker "log utility readings" workflow.
 * The caretaker submits a previous/current electricity reading per tenant; the
 * room-level readings are the sum of those (individual usage = current - previous).
 */
class UtilityCalculatorService {
  /** Pure calculation, no I/O. Throws on negative or invalid usage (400). */
  calculateBreakdown({ occupantReadings, totalElectricBill, totalWaterBill }) {
    if (!Array.isArray(occupantReadings) || occupantReadings.length === 0) {
      throw ApiError.badRequest('At least one occupant reading is required', 'NO_OCCUPANTS');
    }
    if (totalElectricBill < 0 || totalWaterBill < 0) {
      throw ApiError.badRequest('Bill amounts cannot be negative', 'NEGATIVE_BILL_AMOUNT');
    }

    const usageEntries = occupantReadings.map(({ tenantId, previousReading, currentReading }) => {
      if (previousReading < 0 || currentReading < 0) {
        throw ApiError.badRequest('Meter readings cannot be negative', 'NEGATIVE_READING');
      }
      const usageKWh = currentReading - previousReading;
      if (usageKWh < 0) {
        throw ApiError.badRequest('Current reading cannot be less than previous reading', 'NEGATIVE_USAGE');
      }
      return { tenantId, previousReading, currentReading, usageKWh };
    });

    const roomTotalUsageKWh = usageEntries.reduce((sum, e) => sum + e.usageKWh, 0);
    const occupantCount = usageEntries.length;

    const calculatedBreakdown = usageEntries.map((e) => {
      const electricShare = roundMoney(safeDivide(e.usageKWh, roomTotalUsageKWh) * totalElectricBill);
      const waterShare = roundMoney(safeDivide(totalWaterBill, occupantCount));
      return { ...e, electricShare, waterShare };
    });

    const occupants = calculatedBreakdown.map((e) => ({
      tenantId: e.tenantId,
      electricityKWh: e.usageKWh,
      electricityShare: e.electricShare,
      waterShare: e.waterShare,
    }));

    const prevElectricityKWh = usageEntries.reduce((sum, e) => sum + e.previousReading, 0);
    const currElectricityKWh = usageEntries.reduce((sum, e) => sum + e.currentReading, 0);

    return { prevElectricityKWh, currElectricityKWh, roomTotalUsageKWh, occupants, calculatedBreakdown };
  }

  /** Caretaker workflow: validate assignment + room membership, persist, then hand off to billing. */
  async logReading(caretaker, { roomId, readingMonth, totalElectricBill, totalWaterBill, occupantReadings }) {
    const room = await RoomRepository.findById(roomId);
    if (!room) throw ApiError.notFound('Room not found', 'ROOM_NOT_FOUND');

    // Caretakers may only log readings for rooms they are assigned to.
    const hasAssignment = await ReservationRepository.caretakerIsAssignedToRoom(caretaker.id, roomId);
    if (!hasAssignment) {
      throw ApiError.forbidden('You are not assigned to this room', 'NOT_ASSIGNED_TO_ROOM');
    }

    const normalizedMonth = normalizeToMonthStart(readingMonth);
    const existing = await UtilityReadingRepository.findByRoomAndMonth(roomId, normalizedMonth);
    if (existing) {
      throw ApiError.conflict('A reading already exists for this room and month', 'READING_ALREADY_EXISTS');
    }

    // Validate every occupant is currently an active tenant of this room.
    const activeTenantIds = new Set(
      (await ReservationRepository.findActiveTenantIdsForRoom(roomId)).map((r) => String(r.tenantId))
    );
    for (const { tenantId } of occupantReadings) {
      if (!activeTenantIds.has(String(tenantId))) {
        throw ApiError.badRequest(`Tenant ${tenantId} is not an active occupant of this room`, 'INVALID_OCCUPANT');
      }
    }

    const breakdown = this.calculateBreakdown({ occupantReadings, totalElectricBill, totalWaterBill });

    const reading = await UtilityReadingRepository.create({
      roomId,
      caretakerId: caretaker.id,
      readingMonth: normalizedMonth,
      prevElectricityKWh: breakdown.prevElectricityKWh,
      currElectricityKWh: breakdown.currElectricityKWh,
      totalElectricBill,
      totalWaterBill,
      occupants: breakdown.occupants,
      calculatedBreakdown: breakdown.calculatedBreakdown,
    });

    // Required lazily to avoid a circular require at module load time.
    const BillingService = require('./BillingService');
    const soas = await BillingService.generateSOAsFromReading(reading);

    return { reading, soas };
  }

  async listByRoom(roomId) {
    return UtilityReadingRepository.findByRoom(roomId);
  }
}

function normalizeToMonthStart(dateInput) {
  const d = new Date(dateInput);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

module.exports = new UtilityCalculatorService();
