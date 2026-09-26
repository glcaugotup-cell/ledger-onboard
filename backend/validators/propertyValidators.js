const { body, query } = require('express-validator');
const mongoose = require('mongoose');
const { PROPERTY_TYPE, GENDER_POLICY } = require('../utils/constants');
const { findBarangayByName, coordinatesMatchBarangay } = require('../utils/dagupanBarangays');

const searchValidators = [
  query('barangay').optional().trim().isLength({ max: 100 }),
  query('propertyType').optional().isIn(Object.values(PROPERTY_TYPE)),
  query('tenantGenderPolicy').optional().isIn(Object.values(GENDER_POLICY)),
  query('minRent').optional().isFloat({ min: 0 }).toFloat(),
  query('maxRent').optional().isFloat({ min: 0 }).toFloat(),
  query('university').optional().trim().isLength({ max: 100 }),
  query('text').optional().trim().isLength({ max: 200 }),
];

// Each list item (universities, house rules, amenities) must be short, non-empty text.
const listItemsChain = (field, label) =>
  body(field)
    .optional()
    .isArray({ max: 30 })
    .withMessage(`${label} must be a list of at most 30 items`)
    .bail()
    .custom((items) => {
      if (items.some((item) => typeof item !== 'string' || !item.trim() || item.trim().length > 200)) {
        throw new Error(`Each ${label.toLowerCase()} entry must be 1-200 characters`);
      }
      return true;
    });

// `onlyIf` (an express-validator condition) must come first in the chain to skip the checks after it.
const barangayChain = (onlyIf) =>
  (onlyIf ? body('address.barangay').if(onlyIf) : body('address.barangay'))
    .trim()
    .notEmpty()
    .withMessage('Select a barangay')
    .bail()
    .custom((value) => {
      if (!findBarangayByName(value)) throw new Error('Select a valid Dagupan City barangay from the list');
      return true;
    });

// The coordinates must match the submitted barangay (within the tolerance in dagupanBarangays.js).
const coordinatesMatchChain = (onlyIf) =>
  (onlyIf ? body('locationCoordinates').if(onlyIf) : body('locationCoordinates')).custom((value, { req }) => {
    const barangay = findBarangayByName(req.body?.address?.barangay);
    if (!barangay) return true; // missing/invalid barangay is reported by its own check
    if (!coordinatesMatchBarangay(barangay, req.body?.locationCoordinates?.lat, req.body?.locationCoordinates?.lng)) {
      throw new Error('Location coordinates must match the selected barangay');
    }
    return true;
  });

const createPropertyValidators = [
  body('propertyName').trim().isLength({ min: 2, max: 120 }).withMessage('Property name must be 2-120 characters'),
  body('description').optional().trim().isLength({ max: 4000 }).withMessage('Description must be at most 4000 characters'),
  body('address.street').trim().notEmpty().withMessage('Street address is required').bail().isLength({ max: 200 }).withMessage('Street address must be at most 200 characters'),
  // Must be one of the 31 Dagupan City barangays (re-checked here so the API can't bypass the picker).
  barangayChain(),
  body('address.city').optional().trim(),
  body('address.province').optional().trim(),
  body('locationCoordinates.lat').isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude').toFloat(),
  body('locationCoordinates.lng').isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude').toFloat(),
  coordinatesMatchChain(),
  body('propertyType').isIn(Object.values(PROPERTY_TYPE)).withMessage('Select a property type'),
  body('tenantGenderPolicy').isIn(Object.values(GENDER_POLICY)).withMessage('Select a tenant gender policy'),
  listItemsChain('nearbyUniversities', 'Nearby universities'),
  listItemsChain('houseRules', 'House rules'),
  listItemsChain('amenities', 'Amenities'),
];

// Edits send the same fields as creation; the address is re-checked whenever it is sent.
const updatePropertyValidators = [
  body('propertyName').optional().trim().isLength({ min: 2, max: 120 }).withMessage('Property name must be 2-120 characters'),
  body('description').optional().trim().isLength({ max: 4000 }).withMessage('Description must be at most 4000 characters'),
  body('address.street')
    .if(body('address').exists())
    .trim()
    .notEmpty()
    .withMessage('Street address is required')
    .bail()
    .isLength({ max: 200 })
    .withMessage('Street address must be at most 200 characters'),
  barangayChain(body('address').exists()),
  body('locationCoordinates.lat').optional().isFloat({ min: -90, max: 90 }).withMessage('Invalid latitude').toFloat(),
  body('locationCoordinates.lng').optional().isFloat({ min: -180, max: 180 }).withMessage('Invalid longitude').toFloat(),
  coordinatesMatchChain(body('address').exists()),
  body('propertyType').optional().isIn(Object.values(PROPERTY_TYPE)).withMessage('Select a property type'),
  body('tenantGenderPolicy').optional().isIn(Object.values(GENDER_POLICY)).withMessage('Select a tenant gender policy'),
  listItemsChain('nearbyUniversities', 'Nearby universities'),
  listItemsChain('houseRules', 'House rules'),
  listItemsChain('amenities', 'Amenities'),
];

const moderatePropertyValidators = [body('status').isIn(['approved', 'rejected']), body('reason').optional().trim().isLength({ max: 500 })];

const assignCaretakerValidators = [
  body('caretakerId').custom((v) => mongoose.isValidObjectId(v)).withMessage('Select a caretaker to assign'),
];

module.exports = { searchValidators, createPropertyValidators, updatePropertyValidators, moderatePropertyValidators, assignCaretakerValidators };
