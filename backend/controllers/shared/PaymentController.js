const path = require('path');
const PaymentService = require('../../services/PaymentService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../utils/constants');
const env = require('../../config/env');

class PaymentController {
  // Dispatches on the authenticated role, never a client-supplied identity.
  submit = asyncHandler(async (req, res) => {
    if (req.user.role === ROLES.TENANT) {
      const proofImageURL = req.file ? `/uploads/payment-proofs/${req.file.filename}` : null;
      const payment = await PaymentService.submitGcashProof(req.user.id, { ...req.body, proofImageURL });
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
    const absolutePath = path.join(__dirname, '..', '..', payment.proofImageURL.replace(/^\/?uploads\//, `${env.uploadDir}/`));
    res.sendFile(absolutePath);
  });
}

module.exports = new PaymentController();
