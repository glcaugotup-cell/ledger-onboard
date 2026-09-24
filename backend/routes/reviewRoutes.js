const express = require('express');
const ReviewController = require('../controllers/shared/ReviewController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { moderateReviewValidators } = require('../validators/reviewValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate);

// Drives the unregister-flow "you have N tenancies eligible for review" prompt.
router.get('/eligible', requireRole(ROLES.TENANT), ReviewController.listEligible);
router.get('/pending', requireRole(ROLES.ADMIN), ReviewController.listPendingModeration);
router.patch('/:id/moderate', requireRole(ROLES.ADMIN), objectIdParam('id'), moderateReviewValidators, validate, ReviewController.moderate);

module.exports = router;
