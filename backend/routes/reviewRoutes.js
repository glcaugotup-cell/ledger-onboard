const express = require('express');
const ReviewController = require('../controllers/shared/ReviewController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { moderateReviewValidators, updateReviewValidators } = require('../validators/reviewValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

// Drives the rating prompt (after a move-out and in the unregister flow).
router.get('/eligible', requireRole(ROLES.TENANT), ReviewController.listEligible);
router.get('/mine', requireRole(ROLES.TENANT), ReviewController.listMine);
router.get('/pending', requireRole(ROLES.ADMIN), ReviewController.listPendingModeration);
router.get('/', requireRole(ROLES.ADMIN), ReviewController.listForAdmin);
router.patch('/:id/moderate', requireRole(ROLES.ADMIN), objectIdParam('id'), moderateReviewValidators, validate, ReviewController.moderate);
// The tenant edits or (soft) deletes their own review at any time.
router.patch('/:id', requireRole(ROLES.TENANT), objectIdParam('id'), updateReviewValidators, validate, ReviewController.update);
router.delete('/:id', requireRole(ROLES.TENANT), objectIdParam('id'), validate, ReviewController.remove);

module.exports = router;
