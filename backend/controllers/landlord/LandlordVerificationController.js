const LandlordVerificationService = require('../../services/LandlordVerificationService');
const FileStorageService = require('../../services/FileStorageService');
const { FILE_CATEGORIES } = require('../../services/FileStorageService');
const asyncHandler = require('../../utils/asyncHandler');
const sendStoredFile = require('../../utils/sendStoredFile');
const { sendSuccess } = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');

class LandlordVerificationController {
  submit = asyncHandler(async (req, res) => {
    const files = req.files || {};
    const permitFile = files.mayorBusinessPermit?.[0];
    const birFile = files.birForm2303?.[0];
    if (!permitFile || !birFile) {
      throw ApiError.badRequest("Both the Mayor's/Business Permit and BIR Form 2303 are required", 'DOCUMENTS_REQUIRED');
    }

    const result = await LandlordVerificationService.submit(req.user.id, { permitFile, birFile });
    sendSuccess(res, { statusCode: 201, data: result });
  });

  getMine = asyncHandler(async (req, res) => {
    const submission = await LandlordVerificationService.getMine(req.user.id);
    sendSuccess(res, { data: { submission } });
  });

  // The only way to fetch these private files; getDocumentPath enforces owner-or-admin access.
  getDocument = asyncHandler(async (req, res) => {
    const relativeUrl = await LandlordVerificationService.getDocumentPath(req.params.id, req.params.docType, req.user);
    const file = await FileStorageService.getByUrl(relativeUrl, FILE_CATEGORIES.LANDLORD_VERIFICATION);
    sendStoredFile(req, res, file);
  });

  listPending = asyncHandler(async (req, res) => {
    const submissions = await LandlordVerificationService.listPending();
    sendSuccess(res, { data: { submissions } });
  });

  review = asyncHandler(async (req, res) => {
    const submission = await LandlordVerificationService.review(req.params.id, req.user, req.body);
    sendSuccess(res, { data: { submission } });
  });
}

module.exports = new LandlordVerificationController();
