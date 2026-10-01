const IssueService = require('../../services/MaintenanceIssueService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');
const sendStoredFile = require('../../utils/sendStoredFile');

class MaintenanceIssueController {
  list = asyncHandler(async (req, res) => sendSuccess(res, { data: { issues: await IssueService.list(req.user) } }));
  create = asyncHandler(async (req, res) => sendSuccess(res, { statusCode: 201, data: { issue: await IssueService.create(req.user.id, req.body, req.files || []) } }));
  assign = asyncHandler(async (req, res) => sendSuccess(res, { data: { issue: await IssueService.assign(req.params.id, req.user.id, req.body) } }));
  resolve = asyncHandler(async (req, res) => sendSuccess(res, { data: { issue: await IssueService.resolve(req.params.id, req.user.id, req.body.resolutionNotes, req.files || []) } }));
  complete = asyncHandler(async (req, res) => sendSuccess(res, { data: { issue: await IssueService.completeByLandlord(req.params.id, req.user.id) } }));
  media = asyncHandler(async (req, res) => {
    const file = await IssueService.getMedia(req.params.id, req.params.kind, req.params.index, req.user);
    sendStoredFile(req, res, file, { cacheControl: 'private, no-store' });
  });
}
module.exports = new MaintenanceIssueController();
