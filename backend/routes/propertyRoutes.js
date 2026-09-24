const express = require('express');
const PropertyController = require('../controllers/shared/PropertyController');
const ReviewController = require('../controllers/shared/ReviewController');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { searchValidators, createPropertyValidators, updatePropertyValidators } = require('../validators/propertyValidators');
const { createRoomValidators } = require('../validators/roomValidators');
const { submitReviewValidators } = require('../validators/reviewValidators');
const { propertyMediaUpload, assertMediaSizeLimits } = require('../middleware/upload');
const { ROLES } = require('../utils/constants');

const router = express.Router();

// Public discovery — optionalAuthenticate so a logged-in tenant could later
// get personalized results without requiring a token.
router.get('/', optionalAuthenticate, searchValidators, validate, PropertyController.search);
// Must be registered before /:id so "mine" isn't parsed as an ObjectId param.
router.get('/mine', authenticate, requireRole(ROLES.LANDLORD), PropertyController.listMine);
router.get('/:id', objectIdParam('id'), validate, PropertyController.getPublicDetail);
router.get('/:id/manage', authenticate, objectIdParam('id'), validate, PropertyController.getForManagement);

// Up to 5 photos + 1 optional video; assertMediaSizeLimits enforces per-field size limits.
const propertyMediaFields = propertyMediaUpload.fields([
  { name: 'images', maxCount: 5 },
  { name: 'video', maxCount: 1 },
]);

router.post(
  '/',
  authenticate,
  requireRole(ROLES.LANDLORD),
  propertyMediaFields,
  assertMediaSizeLimits,
  createPropertyValidators,
  validate,
  PropertyController.create
);
router.patch(
  '/:id',
  authenticate,
  requireRole(ROLES.LANDLORD, ROLES.ADMIN),
  objectIdParam('id'),
  propertyMediaFields,
  assertMediaSizeLimits,
  updatePropertyValidators,
  validate,
  PropertyController.update
);
router.delete('/:id', authenticate, requireRole(ROLES.LANDLORD, ROLES.ADMIN), objectIdParam('id'), validate, PropertyController.remove);

router.get('/:id/rooms', objectIdParam('id'), validate, PropertyController.listRooms);
router.post(
  '/:id/rooms',
  authenticate,
  requireRole(ROLES.LANDLORD, ROLES.ADMIN),
  objectIdParam('id'),
  createRoomValidators,
  validate,
  PropertyController.createRoom
);

router.get('/:propertyId/reviews', objectIdParam('propertyId'), validate, ReviewController.listForProperty);
router.post(
  '/:propertyId/reviews',
  authenticate,
  requireRole(ROLES.TENANT),
  objectIdParam('propertyId'),
  submitReviewValidators,
  validate,
  ReviewController.submit
);

module.exports = router;
