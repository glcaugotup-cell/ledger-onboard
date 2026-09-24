const express = require('express');
const CaretakerController = require('../controllers/landlord/CaretakerController');
const AnalyticsController = require('../controllers/landlord/AnalyticsController');
const LandlordVerificationController = require('../controllers/landlord/LandlordVerificationController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { createCaretakerValidators } = require('../validators/authValidators');
const { objectIdParam } = require('../validators/commonValidators');
const { documentParamValidators } = require('../validators/landlordVerificationValidators');
const { landlordVerificationUpload } = require('../middleware/upload');
const { ROLES } = require('../utils/constants');

const caretakersRouter = express.Router();
caretakersRouter.use(authenticate);
// Only an authenticated landlord may create a caretaker (there is no public caretaker registration).
caretakersRouter.post('/caretakers', requireRole(ROLES.LANDLORD), createCaretakerValidators, validate, CaretakerController.create);
caretakersRouter.get('/caretakers', requireRole(ROLES.LANDLORD), CaretakerController.list);
caretakersRouter.patch('/caretakers/:id', requireRole(ROLES.LANDLORD), objectIdParam('id'), validate, CaretakerController.update);

// Analytics is mounted at /api/analytics/landlord.
const analyticsRouter = express.Router();
analyticsRouter.use(authenticate);
analyticsRouter.get('/landlord', requireRole(ROLES.LANDLORD, ROLES.ADMIN), AnalyticsController.getLandlordAnalytics);

// Business verification, mounted at /api/landlord/verification. Document downloads
// are checked in the service (owning landlord or admin) rather than by requireRole.
const verificationRouter = express.Router();
verificationRouter.use(authenticate);
verificationRouter.post(
  '/verification',
  requireRole(ROLES.LANDLORD),
  landlordVerificationUpload.fields([
    { name: 'mayorBusinessPermit', maxCount: 1 },
    { name: 'birForm2303', maxCount: 1 },
  ]),
  LandlordVerificationController.submit
);
verificationRouter.get('/verification/mine', requireRole(ROLES.LANDLORD), LandlordVerificationController.getMine);
verificationRouter.get(
  '/verification/:id/document/:docType',
  objectIdParam('id'),
  documentParamValidators,
  validate,
  LandlordVerificationController.getDocument
);

module.exports = { caretakersRouter, analyticsRouter, verificationRouter };
