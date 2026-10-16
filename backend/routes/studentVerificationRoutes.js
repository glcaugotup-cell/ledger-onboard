const express = require('express');
const StudentVerificationController = require('../controllers/shared/StudentVerificationController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/commonValidators');
const { submitStudentVerificationValidators, studentDocumentParamValidators } = require('../validators/studentVerificationValidators');
const { studentIdUpload } = require('../middleware/upload');
const { uploadRateLimiter } = require('../middleware/rateLimit');
const { ROLES } = require('../utils/constants');

// Student ID verification, mounted at /api/student-verification. Admin review routes live in
// adminRoutes; photo downloads are checked in the service (the student or an admin).
const router = express.Router();
router.use(authenticate);

router.post('/', requireRole(ROLES.TENANT), uploadRateLimiter, studentIdUpload, submitStudentVerificationValidators, validate, StudentVerificationController.submit);
// Before the admin decides, the student may swap either photo on their pending submission.
router.patch('/:id/documents', requireRole(ROLES.TENANT), uploadRateLimiter, studentIdUpload, objectIdParam('id'), validate, StudentVerificationController.replaceDocuments);
router.get('/mine', requireRole(ROLES.TENANT), StudentVerificationController.getMine);
router.get('/:id/document/:docType', objectIdParam('id'), studentDocumentParamValidators, validate, StudentVerificationController.getDocument);

module.exports = router;
