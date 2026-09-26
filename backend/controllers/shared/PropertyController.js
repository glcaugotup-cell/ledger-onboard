const PropertyService = require('../../services/PropertyService');
const RoomService = require('../../services/RoomService');
const asyncHandler = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/ApiResponse');

class PropertyController {
  search = asyncHandler(async (req, res) => {
    const { barangay, propertyType, tenantGenderPolicy, minRent, maxRent, university, text, skip, limit } = req.query;
    const properties = await PropertyService.search(
      { barangay, propertyType, tenantGenderPolicy, minRent, maxRent, university, text },
      { skip, limit }
    );
    sendSuccess(res, { data: { properties } });
  });

  getPublicDetail = asyncHandler(async (req, res) => {
    const result = await PropertyService.getPublicDetail(req.params.id);
    sendSuccess(res, { data: result });
  });

  listMine = asyncHandler(async (req, res) => {
    const properties = await PropertyService.listMine(req.user.id);
    sendSuccess(res, { data: { properties } });
  });

  getForManagement = asyncHandler(async (req, res) => {
    const result = await PropertyService.getDetailForManagement(req.params.id, req.user);
    sendSuccess(res, { data: result });
  });

  create = asyncHandler(async (req, res) => {
    const media = { images: req.files?.images || [], video: req.files?.video?.[0] || null };
    const property = await PropertyService.create(req.user.id, req.body, media);
    sendSuccess(res, { statusCode: 201, data: { property } });
  });

  update = asyncHandler(async (req, res) => {
    const media = { images: req.files?.images || [], video: req.files?.video?.[0] || null };
    const property = await PropertyService.update(req.params.id, req.user, req.body, media);
    sendSuccess(res, { data: { property } });
  });

  remove = asyncHandler(async (req, res) => {
    const result = await PropertyService.delete(req.params.id, req.user);
    sendSuccess(res, { data: result });
  });

  listPendingModeration = asyncHandler(async (req, res) => {
    const properties = await PropertyService.listPendingModeration();
    sendSuccess(res, { data: { properties } });
  });

  moderate = asyncHandler(async (req, res) => {
    const property = await PropertyService.moderate(req.params.id, req.body);
    sendSuccess(res, { data: { property } });
  });

  listCaretakerSuggestions = asyncHandler(async (req, res) => {
    const result = await PropertyService.listCaretakerSuggestions(req.params.id, req.user);
    sendSuccess(res, { data: result });
  });

  assignCaretaker = asyncHandler(async (req, res) => {
    const property = await PropertyService.assignCaretaker(req.params.id, req.user, req.body.caretakerId);
    sendSuccess(res, { data: { property } });
  });

  listRooms = asyncHandler(async (req, res) => {
    const rooms = await RoomService.listByProperty(req.params.id);
    sendSuccess(res, { data: { rooms } });
  });

  createRoom = asyncHandler(async (req, res) => {
    const room = await RoomService.create(req.params.id, req.user, req.body);
    sendSuccess(res, { statusCode: 201, data: { room } });
  });
}

module.exports = new PropertyController();
