const UtilityCalculatorService = require('../../services/UtilityCalculatorService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class UtilityController {
  logReading = asyncHandler(async (req, res) => {
    const result = await UtilityCalculatorService.logReading(req.user, req.body);
    sendSuccess(res, { statusCode: 201, data: result });
  });

  listByRoom = asyncHandler(async (req, res) => {
    const readings = await UtilityCalculatorService.listByRoom(req.params.roomId);
    sendSuccess(res, { data: { readings } });
  });
}

module.exports = new UtilityController();
