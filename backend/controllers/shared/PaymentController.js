const PaymentService = require('../../services/PaymentService');
const FileStorageService = require('../../services/FileStorageService');
const { FILE_CATEGORIES } = require('../../services/FileStorageService');
const asyncHandler = require('../../utils/asyncHandler');
const sendStoredFile = require('../../utils/sendStoredFile');
const { sendSuccess } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../utils/constants');

class PaymentController {
  // Dispatches on the authenticated role, never a client-supplied identity.
  submit = asyncHandler(async (req, res) => {
    if (req.user.role === ROLES.TENANT) {
      const payment = await PaymentService.submitGcashProof(req.user.id, req.body, req.file);
      return sendSuccess(res, { statusCode: 201, data: { payment } });
    }
    if (req.user.role === ROLES.CARETAKER) {
      const payment = await PaymentService.submitCashPayment(req.user, req.body);
      return sendSuccess(res, { statusCode: 201, data: { payment } });
    }
    throw ApiError.forbidden('Only tenants (GCash) or caretakers (cash) can submit payments', 'FORBIDDEN_PAYMENT_SUBMIT');
  });

  list = asyncHandler(async (req, res) => {
    const payments = await PaymentService.listForRequester(req.user);
    sendSuccess(res, { data: { payments } });
  });

  verify = asyncHandler(async (req, res) => {
    const payment = await PaymentService.verifyPayment(req.params.id, req.user, req.body);
    sendSuccess(res, { data: { payment } });
  });

  getProofImage = asyncHandler(async (req, res) => {
    const payment = await PaymentService.getProofImageInfo(req.params.id, req.user);
    const file = await FileStorageService.getByUrl(payment.proofImageURL, FILE_CATEGORIES.PAYMENT_PROOFS);
    sendStoredFile(req, res, file);
  });
}

module.exports = new PaymentController();
