/**
 * One-time copy of files from the old on-disk uploads folder into GridFS, keeping
 * their filenames so existing "/uploads/<category>/<file>" references keep working.
 * Safe to re-run: files already in GridFS are skipped. Nothing on disk is deleted.
 * Run: npm run migrate:uploads
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const FileRepository = require('../repositories/FileRepository');
const { FILE_CATEGORIES } = require('../services/FileStorageService');

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

async function main() {
  const sourceRoot = path.join(__dirname, '..', env.uploadDir);
  await connectDB();

  const totals = { copied: 0, skipped: 0 };
  for (const category of Object.values(FILE_CATEGORIES)) {
    const dir = path.join(sourceRoot, category);
    if (!fs.existsSync(dir)) continue;
    for (const filename of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, filename);
      if (!fs.statSync(fullPath).isFile()) continue;
      // eslint-disable-next-line no-await-in-loop
      if (await FileRepository.findOne({ filename, category })) {
        totals.skipped += 1;
        continue;
      }
      const contentType = CONTENT_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
      // eslint-disable-next-line no-await-in-loop
      await FileRepository.upload({ filename, buffer: fs.readFileSync(fullPath), contentType, category });
      totals.copied += 1;
      // eslint-disable-next-line no-console
      console.log(`[migrate] copied ${category}/${filename}`);
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate] done — copied ${totals.copied}, already in GridFS ${totals.skipped}.`);
  await disconnectDB();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed:', err);
  process.exit(1);
});
