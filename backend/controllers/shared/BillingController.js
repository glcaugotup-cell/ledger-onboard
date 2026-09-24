const BillingService = require('../../services/BillingService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class BillingController {
  list = asyncHandler(async (req, res) => {
    const soas = await BillingService.listForRequester(req.user);
    sendSuccess(res, { data: { soas } });
  });

  getById = asyncHandler(async (req, res) => {
    const soa = await BillingService.getByIdForRequester(req.params.id, req.user);
    sendSuccess(res, { data: { soa } });
  });
}

module.exports = new BillingController();
