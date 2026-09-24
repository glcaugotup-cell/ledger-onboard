const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Business permits / BIR forms are typically scanned as PDF or photographed.
const DOCUMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function makeStorage(subdir) {
  return multer.diskStorage({
    destination: path.join(__dirname, '..', env.uploadDir, subdir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });
}

function fileFilter(allowedMimeTypes) {
  return (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPEG, PNG, WEBP, or PDF files are allowed', 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  };
}

function buildUploader(subdir, allowedMimeTypes = IMAGE_MIME_TYPES) {
  return multer({
    storage: makeStorage(subdir),
    fileFilter: fileFilter(allowedMimeTypes),
    limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 10 },
  });
}

const paymentProofUpload = buildUploader('payment-proofs');
// Private: not statically served; only available through an authenticated, ownership-checked route.
const landlordVerificationUpload = buildUploader('landlord-verification', DOCUMENT_MIME_TYPES);

/**
 * Property photos (up to 5) and one optional video, read in a single multer pass.
 * Stored in the publicly served `properties` folder. multer only supports one
 * size limit per instance, so it uses the video limit here and
 * `assertMediaSizeLimits` enforces the smaller per-image limit afterward.
 */
const PROPERTY_MEDIA_FIELD_MIME_TYPES = { images: IMAGE_MIME_TYPES, video: VIDEO_MIME_TYPES };

const propertyMediaUpload = multer({
  storage: makeStorage('properties'),
  fileFilter: (req, file, cb) => {
    const allowed = PROPERTY_MEDIA_FIELD_MIME_TYPES[file.fieldname];
    if (!allowed || !allowed.has(file.mimetype)) {
      const kind = file.fieldname === 'video' ? 'Only MP4, WEBM, or MOV videos are allowed' : 'Only JPEG, PNG, or WEBP photos are allowed';
      return cb(ApiError.badRequest(kind, 'INVALID_FILE_TYPE'));
    }
    cb(null, true);
  },
  limits: { fileSize: env.maxVideoUploadMb * 1024 * 1024, files: 6 },
});

/** Must run right after propertyMediaUpload.fields(...). */
function assertMediaSizeLimits(req, res, next) {
  const images = req.files?.images || [];
  const video = req.files?.video || [];

  const oversizedImage = images.find((f) => f.size > env.maxUploadMb * 1024 * 1024);
  const oversizedVideo = video.find((f) => f.size > env.maxVideoUploadMb * 1024 * 1024);
  if (!oversizedImage && !oversizedVideo) return next();

  // A rejected upload removes all of its files.
  for (const f of [...images, ...video]) {
    fs.unlink(f.path, () => {});
  }

  if (oversizedImage) {
    return next(ApiError.badRequest(`Each photo must be ${env.maxUploadMb}MB or smaller`, 'IMAGE_TOO_LARGE'));
  }
  return next(ApiError.badRequest(`The video must be ${env.maxVideoUploadMb}MB or smaller`, 'VIDEO_TOO_LARGE'));
}

module.exports = {
  paymentProofUpload,
  landlordVerificationUpload,
  propertyMediaUpload,
  assertMediaSizeLimits,
};
