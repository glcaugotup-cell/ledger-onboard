const AdminService = require('../../services/AdminService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const { sanitizeUser } = require('../../utils/sanitize');

class AdminController {
  listUsers = asyncHandler(async (req, res) => {
    const { role, accountStatus, skip, limit } = req.query;
    const users = await AdminService.listUsers({ role, accountStatus, skip, limit });
    sendSuccess(res, { data: { users: users.map(sanitizeUser) } });
  });

  listAuditLogs = asyncHandler(async (req, res) => {
    const { action, actorId, targetType, skip, limit } = req.query;
    const logs = await AdminService.listAuditLogs({ action, actorId, targetType, skip, limit });
    sendSuccess(res, { data: { logs } });
  });

  // Returns the code once; it is never stored or logged in readable form.
  issuePasswordResetCode = asyncHandler(async (req, res) => {
    const result = await AdminService.issuePasswordResetCode(req.user.id, req.params.id);
    sendSuccess(res, { statusCode: 201, data: result });
  });

  // Main admin only. The setup code is returned once, like a reset code.
  createAdmin = asyncHandler(async (req, res) => {
    const { user, code, expiresAt } = await AdminService.createAdmin(req.user.id, req.body);
    sendSuccess(res, { statusCode: 201, data: { user: sanitizeUser(user), code, expiresAt } });
  });

  setUserStatus = asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    const user = await AdminService.setUserStatus(req.user.id, req.params.id, status, reason);
    sendSuccess(res, { data: { user: sanitizeUser(user) } });
  });

  archiveUser = asyncHandler(async (req, res) => {
    const user = await AdminService.archiveUser(req.user.id, req.params.id, req.body.reason);
    sendSuccess(res, { data: { user: sanitizeUser(user) } });
  });

  restoreUser = asyncHandler(async (req, res) => {
    const user = await AdminService.restoreUser(req.user.id, req.params.id);
    sendSuccess(res, { data: { user: sanitizeUser(user) } });
  });

  deleteUser = asyncHandler(async (req, res) => {
    await AdminService.deleteUser(req.user.id, req.params.id);
    sendSuccess(res, { data: { deleted: true } });
  });

  deactivateForInactivity = asyncHandler(async (req, res) => {
    const user = await AdminService.deactivateForInactivity(req.user.id, req.params.id, req.body.reason);
    sendSuccess(res, { data: { user: sanitizeUser(user) } });
  });
}

module.exports = new AdminController();
