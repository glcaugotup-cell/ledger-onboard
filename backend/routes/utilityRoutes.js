const express = require('express');
const UtilityController = require('../controllers/caretaker/UtilityController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { logReadingValidators, logFixedRateValidators } = require('../validators/utilityValidators');
const { ROLES } = require('../utils/constants');
const { utilityEntryRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();
router.use(authenticate);

router.post('/readings', requireRole(ROLES.CARETAKER), utilityEntryRateLimiter, logReadingValidators, validate, UtilityController.logReading);
router.post('/fixed-rate', requireRole(ROLES.CARETAKER), utilityEntryRateLimiter, logFixedRateValidators, validate, UtilityController.logFixedRate);
router.get('/readings/mine', requireRole(ROLES.CARETAKER), UtilityController.listMine);
router.get('/readings/room/:roomId', requireRole(ROLES.CARETAKER, ROLES.LANDLORD, ROLES.ADMIN), objectIdParam('roomId'), validate, UtilityController.listByRoom);

module.exports = router;
