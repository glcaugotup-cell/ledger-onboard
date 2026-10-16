const StudentVerificationService = require('../../services/StudentVerificationService');
const FileStorageService = require('../../services/FileStorageService');
const { FILE_CATEGORIES } = require('../../services/FileStorageService');
const asyncHandler = require('../../utils/asyncHandler');
const sendStoredFile = require('../../utils/sendStoredFile');
const { sendSuccess } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

/** Student ID verification: the student's own routes and the admin's review routes. */
class StudentVerificationController {
  submit = asyncHandler(async (req, res) => {
    const frontFile = req.files?.idFront?.[0];
    const backFile = req.files?.idBack?.[0];
    if (!frontFile || !backFile) {
      throw ApiError.badRequest('Add photos of both the front and the back of your school ID', 'DOCUMENTS_REQUIRED');
    }
    const { school, validFromYear, validUntilYear } = req.body;
    const result = await StudentVerificationService.submit(req.user.id, { frontFile, backFile, school, validFromYear, validUntilYear });
    sendSuccess(res, { statusCode: 201, data: result });
  });

  replaceDocuments = asyncHandler(async (req, res) => {
    const frontFile = req.files?.idFront?.[0];
    const backFile = req.files?.idBack?.[0];
    if (!frontFile && !backFile) {
      throw ApiError.badRequest('Choose a new photo for the front or the back of your ID', 'DOCUMENTS_REQUIRED');
    }
    const result = await StudentVerificationService.replaceDocuments(req.user.id, req.params.id, { frontFile, backFile });
    sendSuccess(res, { data: result });
  });

  getMine = asyncHandler(async (req, res) => {
    const submission = await StudentVerificationService.getMine(req.user.id);
    sendSuccess(res, { data: { submission } });
  });

  // The only way to fetch these private photos; getDocumentPath enforces owner-or-admin access.
  getDocument = asyncHandler(async (req, res) => {
    const relativeUrl = await StudentVerificationService.getDocumentPath(req.params.id, req.params.docType, req.user);
    const file = await FileStorageService.getByUrl(relativeUrl, FILE_CATEGORIES.STUDENT_VERIFICATION);
    sendStoredFile(req, res, file);
  });

  listPending = asyncHandler(async (req, res) => {
    const submissions = await StudentVerificationService.listPending();
    sendSuccess(res, { data: { submissions } });
  });

  review = asyncHandler(async (req, res) => {
    const submission = await StudentVerificationService.review(req.params.id, req.user, req.body);
    sendSuccess(res, { data: { submission } });
  });
}

module.exports = new StudentVerificationController();
