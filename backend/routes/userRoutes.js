const express = require('express');
const UserController = require('../controllers/shared/UserController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { updateProfileValidators } = require('../validators/userValidators');
const { objectIdParam } = require('../validators/commonValidators');
const { requireRole } = require('../middleware/rbac');
const { paymentProofUpload } = require('../middleware/upload');
const { ROLES } = require('../utils/constants');
const { uploadRateLimiter } = require('../middleware/rateLimit');

const userRouter = express.Router();
userRouter.use(authenticate);
userRouter.get('/me', UserController.getMe);
userRouter.patch('/me', updateProfileValidators, validate, UserController.updateMe);
userRouter.get('/me/payment-qr', requireRole(ROLES.LANDLORD), UserController.getPaymentQr);
userRouter.patch('/me/payment-qr', requireRole(ROLES.LANDLORD), uploadRateLimiter, paymentProofUpload.single('paymentQr'), UserController.uploadPaymentQr);

// /api/notifications is a top-level resource that shares UserController (mounted in routes/index.js).
const notificationsRouter = express.Router();
notificationsRouter.use(authenticate);
notificationsRouter.get('/', UserController.listNotifications);
notificationsRouter.patch('/read-all', UserController.markAllNotificationsRead);
notificationsRouter.patch('/:id/read', objectIdParam('id'), validate, UserController.markNotificationRead);

module.exports = { userRouter, notificationsRouter };
