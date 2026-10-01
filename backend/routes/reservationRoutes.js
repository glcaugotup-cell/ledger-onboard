const express = require('express');
const { body } = require('express-validator');
const ReservationController = require('../controllers/shared/ReservationController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { createReservationValidators, updateReservationStatusValidators } = require('../validators/reservationValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

router.post('/', requireRole(ROLES.TENANT), createReservationValidators, validate, ReservationController.create);
router.get('/', ReservationController.list); // role-scoped inside the service
router.patch('/:id/status', objectIdParam('id'), updateReservationStatusValidators, validate, ReservationController.updateStatus);
router.patch('/:id/caretaker', requireRole(ROLES.LANDLORD, ROLES.ADMIN), objectIdParam('id'), body('caretakerId').isMongoId(), validate, ReservationController.reassignCaretaker);

module.exports = router;
