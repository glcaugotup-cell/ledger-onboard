const express = require('express');
const { body, param } = require('express-validator');
const IssueController = require('../controllers/shared/MaintenanceIssueController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { paymentProofUpload } = require('../middleware/upload');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);
router.get('/', requireRole(ROLES.TENANT, ROLES.LANDLORD, ROLES.CARETAKER), IssueController.list);
router.post('/', requireRole(ROLES.TENANT), paymentProofUpload.array('photos', 5), body('reservationId').isMongoId(), body('category').trim().isLength({ min: 2, max: 80 }), body('urgency').isIn(['low', 'medium', 'high']), body('description').trim().isLength({ min: 5, max: 3000 }), validate, IssueController.create);
router.patch('/:id/assignment', requireRole(ROLES.LANDLORD), objectIdParam('id'), body('caretakerId').isMongoId(), body('internalNotes').optional().isLength({ max: 2000 }), body('landlordUpdate').optional().isLength({ max: 2000 }), body('targetDate').optional({ values: 'falsy' }).isISO8601(), validate, IssueController.assign);
router.patch('/:id/complete', requireRole(ROLES.LANDLORD), objectIdParam('id'), validate, IssueController.complete);
router.patch('/:id/resolve', requireRole(ROLES.CARETAKER), objectIdParam('id'), paymentProofUpload.array('photos', 5), body('resolutionNotes').trim().isLength({ min: 3, max: 2000 }), validate, IssueController.resolve);
router.get('/:id/media/:kind/:index', objectIdParam('id'), param('kind').isIn(['photo', 'proof']), param('index').isInt({ min: 0, max: 4 }), validate, IssueController.media);
module.exports = router;
