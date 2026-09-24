const express = require('express');
const UtilityController = require('../controllers/caretaker/UtilityController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { logReadingValidators } = require('../validators/utilityValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

router.post('/readings', requireRole(ROLES.CARETAKER), logReadingValidators, validate, UtilityController.logReading);
router.get('/readings/room/:roomId', requireRole(ROLES.CARETAKER, ROLES.LANDLORD, ROLES.ADMIN), objectIdParam('roomId'), validate, UtilityController.listByRoom);

module.exports = router;
