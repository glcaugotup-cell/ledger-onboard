const express = require('express');
const { body } = require('express-validator');
const ReservationController = require('../controllers/shared/ReservationController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { createReservationValidators, updateReservationStatusValidators, leaveRequestValidators, leaveDecisionValidators } = require('../validators/reservationValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

router.post('/', requireRole(ROLES.TENANT), createReservationValidators, validate, ReservationController.create);
router.get('/', ReservationController.list); // role-scoped inside the service
router.patch('/:id/status', objectIdParam('id'), updateReservationStatusValidators, validate, ReservationController.updateStatus);
router.patch('/:id/caretaker', requireRole(ROLES.LANDLORD, ROLES.ADMIN), objectIdParam('id'), body('caretakerId').isMongoId(), validate, ReservationController.reassignCaretaker);
// Ending a current stay: the tenant asks, the landlord approves (then marks moved out) or declines.
router.post('/:id/leave-request', requireRole(ROLES.TENANT), objectIdParam('id'), leaveRequestValidators, validate, ReservationController.requestLeave);
router.patch('/:id/leave-request', requireRole(ROLES.LANDLORD, ROLES.ADMIN), objectIdParam('id'), leaveDecisionValidators, validate, ReservationController.decideLeave);

module.exports = router;
