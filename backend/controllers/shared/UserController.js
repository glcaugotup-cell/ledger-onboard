const AuthService = require('../../services/AuthService');
const NotificationService = require('../../services/NotificationService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const PaymentQrService = require('../../services/PaymentQrService');
const sendStoredFile = require('../../utils/sendStoredFile');

// Minimal standalone pages for unsubscribe links opened from an email (no app session needed).
const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:48px 16px;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#1e293b;"><div style="max-width:440px;margin:0 auto;padding:32px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;">
<h1 style="margin:0 0 16px;font-size:22px;color:#1b362b;">${title}</h1>${body}</div></body></html>`;
const INVALID_LINK = page('Link not valid', '<p>This unsubscribe link is not valid. You can turn off email notifications in Profile in Ledger OnBoard.</p>');

class UserController {
  getMe = asyncHandler(async (req, res) => {
    const user = await AuthService.getProfile(req.user.id);
    sendSuccess(res, { data: { user } });
  });

  updateMe = asyncHandler(async (req, res) => {
    const user = await AuthService.updateProfile(req.user.id, req.body);
    sendSuccess(res, { data: { user } });
  });

  uploadPaymentQr = asyncHandler(async (req, res) => {
    const result = await PaymentQrService.uploadForLandlord(req.user.id, req.file);
    sendSuccess(res, { data: result });
  });

  getPaymentQr = asyncHandler(async (req, res) => {
    const file = await PaymentQrService.getForLandlord(req.user.id);
    sendStoredFile(req, res, file);
  });

  // GET only asks for confirmation, so mail scanners that open links cannot unsubscribe anyone.
  showUnsubscribe = (req, res) => {
    const { u, t } = req.query;
    if (!NotificationService.verifyUnsubscribeLink(u, t)) return res.status(400).type('html').send(INVALID_LINK);
    return res.type('html').send(page('Stop email notifications?', `<p>You will stop getting Ledger OnBoard notification emails. In-app notifications, sign-in codes and security notices continue.</p>
<form method="post"><button type="submit" style="margin-top:8px;padding:12px 20px;border:0;border-radius:10px;background:#2c654a;color:#fff;font-size:15px;cursor:pointer;">Unsubscribe</button></form>`));
  };

  // POST is the RFC 8058 one-click request from the mail provider, or the button above.
  unsubscribe = asyncHandler(async (req, res) => {
    if (!(await NotificationService.unsubscribeEmail(req.query.u, req.query.t))) return res.status(400).type('html').send(INVALID_LINK);
    return res.type('html').send(page('You are unsubscribed', '<p>Ledger OnBoard will no longer send you notification emails. You can turn them back on in Profile → Email notifications.</p>'));
  });

  listNotifications = asyncHandler(async (req, res) => {
    const { onlyUnread, skip, limit } = req.query;
    const [notifications, unreadCount] = await Promise.all([
      NotificationService.listForUser(req.user.id, {
        onlyUnread: onlyUnread === 'true',
        skip,
        limit,
      }),
      NotificationService.unreadCount(req.user.id),
    ]);
    sendSuccess(res, { data: { notifications, unreadCount } });
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
