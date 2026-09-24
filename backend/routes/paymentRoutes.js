const express = require('express');
const PaymentController = require('../controllers/shared/PaymentController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { paymentVerificationRateLimiter } = require('../middleware/rateLimit');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { submitPaymentValidators, verifyPaymentValidators } = require('../validators/paymentValidators');
const { paymentProofUpload } = require('../middleware/upload');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

router.post(
  '/',
  requireRole(ROLES.TENANT, ROLES.CARETAKER),
  paymentProofUpload.single('proofImage'),
  submitPaymentValidators,
  validate,
  PaymentController.submit
);
router.get('/', PaymentController.list); // role-scoped inside the service
router.get('/:id/proof-image', objectIdParam('id'), validate, PaymentController.getProofImage);

// Payment verification is rate-limited.
router.patch(
  '/:id/verify',
  paymentVerificationRateLimiter,
  requireRole(ROLES.LANDLORD, ROLES.ADMIN, ROLES.CARETAKER),
  objectIdParam('id'),
  verifyPaymentValidators,
  validate,
  PaymentController.verify
);

module.exports = router;
