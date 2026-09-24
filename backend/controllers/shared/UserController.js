const AuthService = require('../../services/AuthService');
const NotificationService = require('../../services/NotificationService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class UserController {
  getMe = asyncHandler(async (req, res) => {
    const user = await AuthService.getProfile(req.user.id);
    sendSuccess(res, { data: { user } });
  });

  updateMe = asyncHandler(async (req, res) => {
    const user = await AuthService.updateProfile(req.user.id, req.body);
    sendSuccess(res, { data: { user } });
  });

  listNotifications = asyncHandler(async (req, res) => {
    const { onlyUnread, skip, limit } = req.query;
    const notifications = await NotificationService.listForUser(req.user.id, {
      onlyUnread: onlyUnread === 'true',
      skip,
      limit,
    });
    sendSuccess(res, { data: { notifications } });
  });

  markNotificationRead = asyncHandler(async (req, res) => {
    const notification = await NotificationService.markRead(req.params.id, req.user.id);
    sendSuccess(res, { data: { notification } });
  });

  markAllNotificationsRead = asyncHandler(async (req, res) => {
    await NotificationService.markAllRead(req.user.id);
    sendSuccess(res, { data: { marked: true } });
  });
}

module.exports = new UserController();
