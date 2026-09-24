const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Runs after an express-validator chain and returns field-level format errors.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array({ onlyFirstError: true }).map((e) => ({ field: e.path, message: e.msg }));
  next(ApiError.badRequest('Validation failed', 'VALIDATION_ERROR', details));
}

module.exports = validate;
