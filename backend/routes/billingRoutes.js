const express = require('express');
const BillingController = require('../controllers/shared/BillingController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');

const router = express.Router();
router.use(authenticate);

router.get('/soa', BillingController.list); // role-scoped inside the service
router.get('/soa/:id', objectIdParam('id'), validate, BillingController.getById);

module.exports = router;
