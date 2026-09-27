const RoomService = require('../../services/RoomService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class RoomController {
  update = asyncHandler(async (req, res) => {
    const room = await RoomService.update(req.params.id, req.user, req.body);
    sendSuccess(res, { data: { room } });
  });

  remove = asyncHandler(async (req, res) => {
    const result = await RoomService.delete(req.params.id, req.user);
    sendSuccess(res, { data: result });
  });
}

module.exports = new RoomController();
