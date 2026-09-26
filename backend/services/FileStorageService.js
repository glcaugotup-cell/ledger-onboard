const crypto = require('crypto');
const FileRepository = require('../repositories/FileRepository');
const ApiError = require('../utils/ApiError');

const FILE_CATEGORIES = Object.freeze({
  PROPERTIES: 'properties',
  PAYMENT_PROOFS: 'payment-proofs',
  LANDLORD_VERIFICATION: 'landlord-verification',
});

const URL_PATTERN = /^\/?uploads\/([a-z-]+)\/([^/]+)$/;

// Extension comes from the MIME type (already checked by the upload filters),
// never from the client's filename, so a stored name can't carry ".html" or
// characters that would break its URL.
const EXTENSION_BY_MIME = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
});

/**
 * Stores uploads in MongoDB GridFS so they survive redeploys and restarts.
 * Records keep the same "/uploads/<category>/<filename>" references as before;
 * the category decides which route may serve a file (only "properties" is public).
 */
class FileStorageService {
  static makeFilename(mimetype) {
    const ext = EXTENSION_BY_MIME[mimetype] || '';
    return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  }

  static toUrl(category, filename) {
    return `/uploads/${category}/${filename}`;
  }

  parseUrl(url) {
    const match = typeof url === 'string' ? url.match(URL_PATTERN) : null;
    return match ? { category: match[1], filename: match[2] } : null;
  }

  /** Saves one multer memory-storage file and returns its "/uploads/..." reference. */
  async saveUpload(file, category) {
    const filename = FileStorageService.makeFilename(file.mimetype);
    try {
      await FileRepository.upload({ filename, buffer: file.buffer, contentType: file.mimetype, category });
    } catch (err) {
      // Atlas rejects writes once the database is over its storage quota (512 MB on the free tier).
      if (/quota/i.test(err.message || '')) {
        throw new ApiError(507, 'STORAGE_FULL', 'File storage is full. Please contact the administrator.');
      }
      throw err;
    }
    return FileStorageService.toUrl(category, filename);
  }

  /** Saves several files; if any fails, removes the ones already saved. */
  async saveUploads(files, category) {
    const urls = [];
    try {
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        urls.push(await this.saveUpload(file, category));
      }
      return urls;
    } catch (err) {
      await this.deleteByUrls(urls);
      throw err;
    }
  }

  /** Best effort: a missing file or a failed delete never fails the caller's request. */
  async deleteByUrls(urls) {
    for (const url of urls || []) {
      const ref = this.parseUrl(url);
      if (!ref) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const files = await FileRepository.findAll(ref);
        // eslint-disable-next-line no-await-in-loop
        for (const f of files) await FileRepository.deleteById(f._id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[FileStorageService] failed to delete', url, err.message);
      }
    }
  }

  /** Looks up a stored file by its "/uploads/..." reference, only within the expected category. */
  async getByUrl(url, expectedCategory) {
    const ref = this.parseUrl(url);
    if (!ref || ref.category !== expectedCategory) throw ApiError.notFound('File not found', 'FILE_NOT_FOUND');
    return this.getFile(ref.category, ref.filename);
  }

  async getFile(category, filename) {
    const file = await FileRepository.findOne({ filename, category });
    if (!file) throw ApiError.notFound('File not found', 'FILE_NOT_FOUND');
    return {
      length: file.length,
      contentType: file.metadata?.contentType || file.contentType || 'application/octet-stream',
      uploadDate: file.uploadDate,
      openStream: (range) => FileRepository.openDownloadStream(file._id, range),
    };
  }
}

module.exports = new FileStorageService();
module.exports.FILE_CATEGORIES = FILE_CATEGORIES;
