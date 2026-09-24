const express = require('express');
const RoomController = require('../controllers/shared/RoomController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { updateRoomValidators } = require('../validators/roomValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();

router.patch('/:id', authenticate, requireRole(ROLES.LANDLORD, ROLES.ADMIN), objectIdParam('id'), updateRoomValidators, validate, RoomController.update);

module.exports = router;
