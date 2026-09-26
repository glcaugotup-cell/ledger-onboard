const FileStorageService = require('../../services/FileStorageService');
const { FILE_CATEGORIES } = require('../../services/FileStorageService');
const asyncHandler = require('../../utils/asyncHandler');
const sendStoredFile = require('../../utils/sendStoredFile');

class MediaController {
  // Only the public "properties" category is reachable here; private files have
  // their own authenticated, ownership-checked routes.
  getPropertyMedia = asyncHandler(async (req, res) => {
    const file = await FileStorageService.getFile(FILE_CATEGORIES.PROPERTIES, req.params.filename);
    // Filenames are unique and never reused, so the content never changes.
    sendStoredFile(req, res, file, { cacheControl: 'public, max-age=31536000, immutable' });
  });
}

module.exports = new MediaController();
