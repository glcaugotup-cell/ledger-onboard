const express = require('express');
const AdminController = require('../controllers/admin/AdminController');
const PropertyController = require('../controllers/shared/PropertyController');
const LandlordVerificationController = require('../controllers/landlord/LandlordVerificationController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { listUsersValidators, setUserStatusValidators } = require('../validators/adminValidators');
const { moderatePropertyValidators } = require('../validators/propertyValidators');
const { reviewLandlordVerificationValidators } = require('../validators/landlordVerificationValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate, requireRole(ROLES.ADMIN));

router.get('/users', listUsersValidators, validate, AdminController.listUsers);
router.get('/logs', AdminController.listAuditLogs);
router.patch('/users/:id/status', objectIdParam('id'), setUserStatusValidators, validate, AdminController.setUserStatus);

// Manual per-property moderation. Not used by the UI: verified landlords' listings are approved on creation.
router.get('/properties/pending', PropertyController.listPendingModeration);
router.patch('/properties/:id/moderate', objectIdParam('id'), moderatePropertyValidators, validate, PropertyController.moderate);

// Landlord business-verification review — same cross-reuse pattern as the
// property-moderation routes above.
router.get('/landlord-verifications/pending', LandlordVerificationController.listPending);
router.patch(
  '/landlord-verifications/:id/review',
  objectIdParam('id'),
  reviewLandlordVerificationValidators,
  validate,
  LandlordVerificationController.review
);

module.exports = router;
