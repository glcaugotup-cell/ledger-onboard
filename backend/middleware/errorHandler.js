const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/** 404 fallthrough for unmatched routes. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

/**
 * Shapes every error response. Logs the real error server-side and returns only
 * a safe { success, data, error } envelope (no stack traces or internals).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Something went wrong';

  // Mongoose validation errors -> 400
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Invalid input data';
  }

  // Mongoose bad ObjectId cast -> 400
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = 'Invalid identifier';
  }

  // Mongo duplicate key -> 409
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_RESOURCE';
    message = 'Resource already exists';
  }

  // Multer upload errors (file too large, too many files, etc.) -> 400
  if (err.name === 'MulterError') {
    statusCode = 400;
    code = `UPLOAD_${err.code}`;
    message = err.message;
  }

  // JWT errors -> 401
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    message = 'Authentication token is invalid or expired';
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
    if (env.isProduction) message = 'Internal server error';
  }

  const errorBody = { code, message };
  if (err.details) errorBody.details = err.details;

  res.status(statusCode).json({
    success: false,
    data: null,
    error: errorBody,
  });
}

module.exports = { notFound, errorHandler };
