/** Turns an ApiClientError (thrown by services/apiClient.js) into a { field: message } map plus a top-level message/code. */
export function describeApiError(err) {
  const fieldErrors = {};
  if (Array.isArray(err?.details)) {
    for (const d of err.details) fieldErrors[d.field] = d.message;
  }
  return { message: err?.message || 'Something went wrong. Please try again.', code: err?.code, fieldErrors, details: err?.details };
}
