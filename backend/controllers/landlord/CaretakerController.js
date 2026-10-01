const AuthService = require('../../services/AuthService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class CaretakerController {
  create = asyncHandler(async (req, res) => {
    // landlordId always comes from the authenticated session (req.user.id), never the body.
    const result = await AuthService.createCaretaker(req.user.id, req.body);
    sendSuccess(res, { statusCode: 201, data: result });
  });

  list = asyncHandler(async (req, res) => {
    const caretakers = await AuthService.listCaretakersForLandlord(req.user.id);
    sendSuccess(res, { data: { caretakers } });
  });

  update = asyncHandler(async (req, res) => {
    const caretaker = await AuthService.updateCaretaker(req.user.id, req.params.id, req.body);
    sendSuccess(res, { data: { caretaker } });
  });

  remove = asyncHandler(async (req, res) => {
    const result = await AuthService.removeCaretaker(req.user.id, req.params.id, req.body.reason);
    sendSuccess(res, { data: result });
  });
}

module.exports = new CaretakerController();
