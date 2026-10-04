const express = require('express');
const { body, param } = require('express-validator');
const IssueController = require('../controllers/shared/MaintenanceIssueController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { issuePhotosUpload } = require('../middleware/upload');
const { appDateKey, inputDateKey } = require('../utils/dates');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);
router.get('/', requireRole(ROLES.TENANT, ROLES.LANDLORD, ROLES.CARETAKER), IssueController.list);
router.post('/', requireRole(ROLES.TENANT), issuePhotosUpload, body('reservationId').isMongoId().withMessage('Select a current tenancy'), body('category').trim().isLength({ min: 2, max: 80 }).withMessage('Choose a category'), body('urgency').isIn(['low', 'medium', 'high']), body('description').trim().isLength({ min: 5, max: 3000 }), validate, IssueController.create);
router.patch(
  '/:id/assignment',
  requireRole(ROLES.LANDLORD),
  objectIdParam('id'),
  body('caretakerId').isMongoId(),
  body('internalNotes').optional().isLength({ max: 2000 }),
  body('landlordUpdate').optional().isLength({ max: 2000 }),
  // Required, and today (Philippine date) or later.
  body('targetDate')
    .isISO8601()
    .withMessage('Choose a target resolution date')
    .bail()
    .custom((value) => {
      if (inputDateKey(value) < appDateKey()) throw new Error('The target resolution date cannot be in the past');
      return true;
    }),
  validate,
  IssueController.assign
);
router.patch('/:id/complete', requireRole(ROLES.LANDLORD), objectIdParam('id'), body('workSummary').trim().isLength({ min: 3, max: 2000 }).withMessage('Add a summary of the work done (3 to 2000 characters)'), validate, IssueController.complete);
router.patch('/:id/resolve', requireRole(ROLES.CARETAKER), objectIdParam('id'), issuePhotosUpload, body('resolutionNotes').trim().isLength({ min: 3, max: 2000 }), validate, IssueController.resolve);
router.patch('/:id/confirm', requireRole(ROLES.TENANT), objectIdParam('id'), body('solved').isBoolean().withMessage('Choose solved or not solved').toBoolean(), body('note').optional().trim().isLength({ max: 2000 }), validate, IssueController.confirm);
router.patch('/:id/remove', requireRole(ROLES.LANDLORD), objectIdParam('id'), body('reason').trim().isLength({ min: 3, max: 500 }).withMessage('Give a reason (3 to 500 characters)'), validate, IssueController.remove);
router.patch('/:id/archive', requireRole(ROLES.TENANT, ROLES.CARETAKER), objectIdParam('id'), validate, IssueController.archive);
router.patch('/:id/restore', requireRole(ROLES.TENANT, ROLES.LANDLORD, ROLES.CARETAKER), objectIdParam('id'), validate, IssueController.restore);
router.get('/:id/media/:kind/:index', objectIdParam('id'), param('kind').isIn(['photo', 'proof']), param('index').isInt({ min: 0, max: 4 }), validate, IssueController.media);
module.exports = router;
