const express = require('express');
const AdminController = require('../controllers/admin/AdminController');
const PropertyController = require('../controllers/shared/PropertyController');
const LandlordVerificationController = require('../controllers/landlord/LandlordVerificationController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { listUsersValidators, setUserStatusValidators, deactivateInactiveValidators, archiveUserValidators } = require('../validators/adminValidators');
const { moderatePropertyValidators } = require('../validators/propertyValidators');
const { reviewLandlordVerificationValidators } = require('../validators/landlordVerificationValidators');
const { createAdminValidators } = require('../validators/authValidators');
const { ROLES } = require('../utils/constants');

const router = express.Router();
router.use(authenticate, requireRole(ROLES.ADMIN));

router.get('/users', listUsersValidators, validate, AdminController.listUsers);
router.get('/logs', AdminController.listAuditLogs);
// Main admin only (checked in AdminService): adds another admin and returns a one-time setup code.
router.post('/admins', createAdminValidators, validate, AdminController.createAdmin);
router.patch('/users/:id/status', objectIdParam('id'), setUserStatusValidators, validate, AdminController.setUserStatus);
// One-time password reset code (8 characters, 30 minutes), shown once to the admin to hand over in person.
router.post('/users/:id/reset-code', objectIdParam('id'), validate, AdminController.issuePasswordResetCode);
// Manual, admin-confirmed deactivation of accounts inactive for 60+ days (never automatic).
router.post('/users/:id/deactivate-inactive', objectIdParam('id'), deactivateInactiveValidators, validate, AdminController.deactivateForInactivity);

// Archive: any admin moves an account there (restorable for 30 days); only the main admin deletes now.
router.post('/users/:id/archive', objectIdParam('id'), archiveUserValidators, validate, AdminController.archiveUser);
router.post('/users/:id/restore', objectIdParam('id'), validate, AdminController.restoreUser);
router.delete('/users/:id', objectIdParam('id'), validate, AdminController.deleteUser);

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
