const express = require('express');
const BillingController = require('../controllers/shared/BillingController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { requireRole } = require('../middleware/rbac');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

router.get('/soa', BillingController.list); // role-scoped inside the service
router.get('/soa/:id', objectIdParam('id'), validate, BillingController.getById);
router.get('/soa/:id/payment-qr', requireRole(ROLES.TENANT), objectIdParam('id'), validate, BillingController.getPaymentQr);

module.exports = router;
