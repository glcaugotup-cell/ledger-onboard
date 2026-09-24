const express = require('express');
const UserController = require('../controllers/shared/UserController');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { updateProfileValidators } = require('../validators/userValidators');
const { objectIdParam } = require('../validators/commonValidators');

const userRouter = express.Router();
userRouter.use(authenticate);
userRouter.get('/me', UserController.getMe);
userRouter.patch('/me', updateProfileValidators, validate, UserController.updateMe);

// /api/notifications is a top-level resource that shares UserController (mounted in routes/index.js).
const notificationsRouter = express.Router();
notificationsRouter.use(authenticate);
notificationsRouter.get('/', UserController.listNotifications);
notificationsRouter.patch('/read-all', UserController.markAllNotificationsRead);
notificationsRouter.patch('/:id/read', objectIdParam('id'), validate, UserController.markNotificationRead);

module.exports = { userRouter, notificationsRouter };
