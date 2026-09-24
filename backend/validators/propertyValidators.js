const { body, query } = require('express-validator');
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

const createPropertyValidators = [
  body('propertyName').trim().isLength({ min: 2, max: 120 }),
  body('description').optional().trim().isLength({ max: 4000 }),
  body('address.street').trim().notEmpty(),
  // Must be one of the 31 Dagupan City barangays (re-checked here so the API can't bypass the picker).
  body('address.barangay')
    .trim()
    .notEmpty()
    .custom((value) => {
      if (!findBarangayByName(value)) throw new Error('Select a valid Dagupan City barangay from the list');
      return true;
    }),
  body('address.city').optional().trim(),
  body('address.province').optional().trim(),
  body('locationCoordinates.lat').isFloat({ min: -90, max: 90 }).toFloat(),
  body('locationCoordinates.lng').isFloat({ min: -180, max: 180 }).toFloat(),
  // The coordinates must match the submitted barangay (within the tolerance in dagupanBarangays.js).
  body('locationCoordinates').custom((value, { req }) => {
    const barangay = findBarangayByName(req.body?.address?.barangay);
    if (!barangay) return true; // already rejected by the barangay check above
    if (!coordinatesMatchBarangay(barangay, req.body?.locationCoordinates?.lat, req.body?.locationCoordinates?.lng)) {
      throw new Error('Location coordinates must match the selected barangay');
    }
    return true;
  }),
  body('propertyType').isIn(Object.values(PROPERTY_TYPE)),
  body('tenantGenderPolicy').isIn(Object.values(GENDER_POLICY)),
  body('nearbyUniversities').optional().isArray(),
  body('houseRules').optional().isArray(),
  body('amenities').optional().isArray(),
];

const updatePropertyValidators = [
  body('propertyName').optional().trim().isLength({ min: 2, max: 120 }),
  body('description').optional().trim().isLength({ max: 4000 }),
  body('locationCoordinates.lat').optional().isFloat({ min: -90, max: 90 }),
  body('locationCoordinates.lng').optional().isFloat({ min: -180, max: 180 }),
  body('propertyType').optional().isIn(Object.values(PROPERTY_TYPE)),
  body('tenantGenderPolicy').optional().isIn(Object.values(GENDER_POLICY)),
];

const moderatePropertyValidators = [body('status').isIn(['approved', 'rejected']), body('reason').optional().trim().isLength({ max: 500 })];

module.exports = { searchValidators, createPropertyValidators, updatePropertyValidators, moderatePropertyValidators };
