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

  setUserStatus = asyncHandler(async (req, res) => {
    const { status, reason } = req.body;
    const user = await AdminService.setUserStatus(req.user.id, req.params.id, status, reason);
    sendSuccess(res, { data: { user: sanitizeUser(user) } });
  });
}

module.exports = new AdminController();
