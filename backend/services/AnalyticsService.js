const PropertyRepository = require('../repositories/PropertyRepository');
const RoomRepository = require('../repositories/RoomRepository');
const BillingSOARepository = require('../repositories/BillingSOARepository');
const ApiError = require('../utils/ApiError');
const { roundMoney, safeDivide } = require('../utils/money');
const { ROLES, ROOM_STATUS } = require('../utils/constants');

/**
 * Landlord (and admin) KPI dashboard data:
 *  Occupancy Rate  = (Occupied Rooms / Total Rooms) × 100
 *  Collection Rate = (Verified Payments / Expected Base Rent) × 100
 *  Outstanding Debt = Σ unpaid/overdue remaining balances
 */
class AnalyticsService {
  async getLandlordAnalytics(requester, { landlordId } = {}) {
    let targetLandlordId = requester.id;
    if (requester.role === ROLES.ADMIN && landlordId) {
      targetLandlordId = landlordId;
    } else if (requester.role !== ROLES.LANDLORD && requester.role !== ROLES.ADMIN) {
      throw ApiError.forbidden('Only landlords and admins can view analytics', 'FORBIDDEN_ANALYTICS_ACCESS');
    }

    const properties = await PropertyRepository.findByLandlord(targetLandlordId);
    const propertyIds = properties.map((p) => p._id);
    const rooms = await RoomRepository.find({ propertyId: { $in: propertyIds } });
    const roomIds = rooms.map((r) => r._id);

    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter((r) => r.status === ROOM_STATUS.OCCUPIED).length;
    const occupancyRate = roundMoney(safeDivide(occupiedRooms, totalRooms) * 100);

    // monthlyBaseRent is priced per occupied slot (boarding-house/bedspace
    // model), so expected rent = rate x occupied slots, summed per room.
    const expectedBaseRent = roundMoney(rooms.reduce((sum, r) => sum + r.monthlyBaseRent * r.currentOccupancy, 0));
    const soas = await BillingSOARepository.findByRoomIds(roomIds);
    const verifiedPaymentsTotal = roundMoney(soas.reduce((sum, s) => sum + s.amountPaid, 0));
    const collectionRate = roundMoney(safeDivide(verifiedPaymentsTotal, expectedBaseRent) * 100);

    const outstandingDebt = roundMoney(
      soas.filter((s) => ['UNPAID', 'PARTIAL', 'OVERDUE'].includes(s.paymentStatus)).reduce((sum, s) => sum + s.remainingBalance, 0)
    );

    const revenueTrend = this._monthlyRevenueTrend(soas);
    const roomStatusBreakdown = {
      available: rooms.filter((r) => r.status === ROOM_STATUS.AVAILABLE).length,
      occupied: occupiedRooms,
      maintenance: rooms.filter((r) => r.status === ROOM_STATUS.MAINTENANCE).length,
    };

    return {
      totalProperties: properties.length,
      totalRooms,
      occupiedRooms,
      occupancyRate,
      collectionRate,
      outstandingDebt,
      expectedBaseRent,
      verifiedPaymentsTotal,
      revenueTrend,
      roomStatusBreakdown,
    };
  }

  _monthlyRevenueTrend(soas) {
    const byMonth = new Map();
    for (const soa of soas) {
      const key = soa.billingPeriod.toISOString().slice(0, 7); // YYYY-MM
      byMonth.set(key, roundMoney((byMonth.get(key) || 0) + soa.amountPaid));
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([month, revenue]) => ({ month, revenue }));
  }
}

module.exports = new AnalyticsService();
