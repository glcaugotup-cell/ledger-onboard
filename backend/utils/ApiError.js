/**
 * Application error with an HTTP status and a stable error code. The global
 * error handler turns it into the standard error response.
 */
class ApiError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(message = 'Bad request', code = 'BAD_REQUEST', details) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }

  static conflict(message = 'Conflict', code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }

  static tooManyRequests(message = 'Too many requests', code = 'RATE_LIMITED', details) {
    return new ApiError(429, code, message, details);
  }

  static internal(message = 'Internal server error', code = 'INTERNAL_ERROR') {
    return new ApiError(500, code, message);
  }
}

module.exports = ApiError;
