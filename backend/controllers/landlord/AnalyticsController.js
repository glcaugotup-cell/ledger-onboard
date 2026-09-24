const AnalyticsService = require('../../services/AnalyticsService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class AnalyticsController {
  getLandlordAnalytics = asyncHandler(async (req, res) => {
    const analytics = await AnalyticsService.getLandlordAnalytics(req.user, req.query);
    sendSuccess(res, { data: analytics });
  });
}

module.exports = new AnalyticsController();
