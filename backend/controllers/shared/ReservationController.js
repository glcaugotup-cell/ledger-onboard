const ReservationService = require('../../services/ReservationService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class ReservationController {
  create = asyncHandler(async (req, res) => {
    const reservation = await ReservationService.create(req.user.id, req.body);
    sendSuccess(res, { statusCode: 201, data: { reservation } });
  });

  list = asyncHandler(async (req, res) => {
    const reservations = await ReservationService.listForRequester(req.user);
    sendSuccess(res, { data: { reservations } });
  });

  updateStatus = asyncHandler(async (req, res) => {
    const reservation = await ReservationService.updateStatus(req.params.id, req.user, req.body);
    sendSuccess(res, { data: { reservation } });
  });
}

module.exports = new ReservationController();
