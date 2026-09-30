const BillingService = require('../../services/BillingService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const PaymentQrService = require('../../services/PaymentQrService');
const sendStoredFile = require('../../utils/sendStoredFile');

class BillingController {
  list = asyncHandler(async (req, res) => {
    const soas = await BillingService.listForRequester(req.user);
    sendSuccess(res, { data: { soas } });
  });

  getById = asyncHandler(async (req, res) => {
    const soa = await BillingService.getByIdForRequester(req.params.id, req.user);
    sendSuccess(res, { data: { soa } });
  });

  getPaymentQr = asyncHandler(async (req, res) => {
    const file = await PaymentQrService.getForTenantStatement(req.user.id, req.params.id);
    sendStoredFile(req, res, file);
  });
}

module.exports = new BillingController();
