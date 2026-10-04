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

  reassignCaretaker = asyncHandler(async (req, res) => {
    const reservation = await ReservationService.reassignCaretaker(req.params.id, req.user, req.body.caretakerId);
    sendSuccess(res, { data: { reservation } });
  });

  requestLeave = asyncHandler(async (req, res) => {
    const reservation = await ReservationService.requestLeave(req.params.id, req.user.id, req.body);
    sendSuccess(res, { data: { reservation } });
  });

  decideLeave = asyncHandler(async (req, res) => {
    const reservation = await ReservationService.decideLeave(req.params.id, req.user, req.body);
    sendSuccess(res, { data: { reservation } });
  });
}

module.exports = new ReservationController();
