const express = require('express');

const authRoutes = require('./authRoutes');
const { userRouter, notificationsRouter } = require('./userRoutes');
const { caretakersRouter, analyticsRouter, verificationRouter } = require('./landlordRoutes');
const propertyRoutes = require('./propertyRoutes');
const roomRoutes = require('./roomRoutes');
const reservationRoutes = require('./reservationRoutes');
const utilityRoutes = require('./utilityRoutes');
const billingRoutes = require('./billingRoutes');
const paymentRoutes = require('./paymentRoutes');
const reviewRoutes = require('./reviewRoutes');
const adminRoutes = require('./adminRoutes');
const maintenanceIssueRoutes = require('./maintenanceIssueRoutes');

const router = express.Router();

// Public uptime-monitor endpoint. This router is mounted at /api in app.js.
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Server is healthy' });
});

router.use('/auth', authRoutes);
router.use('/users', userRouter);
router.use('/notifications', notificationsRouter);
router.use('/landlord', caretakersRouter);
router.use('/landlord', verificationRouter);
router.use('/analytics', analyticsRouter);
router.use('/properties', propertyRoutes);
router.use('/rooms', roomRoutes);
router.use('/reservations', reservationRoutes);
router.use('/utilities', utilityRoutes);
router.use('/billing', billingRoutes);
router.use('/payments', paymentRoutes);
router.use('/reviews', reviewRoutes);
router.use('/maintenance-issues', maintenanceIssueRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
