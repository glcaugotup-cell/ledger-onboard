/** Standard success envelope: { success, data, error }. */
function sendSuccess(res, { statusCode = 200, data = null, meta = undefined } = {}) {
  const body = { success: true, data, error: null };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
