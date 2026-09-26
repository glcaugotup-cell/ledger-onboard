const mongoose = require('mongoose');

const BUCKET_NAME = 'uploads';

/**
 * GridFS access for uploaded files (bucket "uploads" -> uploads.files / uploads.chunks).
 * Like the other repositories, this is the only layer that talks to MongoDB for files.
 */
class FileRepository {
  _bucket() {
    const { db } = mongoose.connection;
    if (!db) throw new Error('MongoDB is not connected');
    // Cached per connection so reconnects (and the test in-memory DB) get a fresh bucket.
    if (!this._cached || this._cachedDb !== db) {
      this._cached = new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
      this._cachedDb = db;
    }
    return this._cached;
  }

  upload({ filename, buffer, contentType, category }) {
    return new Promise((resolve, reject) => {
      const stream = this._bucket().openUploadStream(filename, { metadata: { category, contentType } });
      stream.once('error', (err) => {
        // Remove any chunks already written so a failed upload leaves nothing behind.
        new Promise((done) => done(stream.abort())).catch(() => {}).finally(() => reject(err));
      });
      stream.once('finish', () => resolve(stream.id));
      stream.end(buffer);
    });
  }

  async findOne({ filename, category }) {
    const [file] = await this._bucket().find({ filename, 'metadata.category': category }).limit(1).toArray();
    return file || null;
  }

  async findAll({ filename, category }) {
    return this._bucket().find({ filename, 'metadata.category': category }).toArray();
  }

  /** `end` is exclusive, matching the MongoDB driver. */
  openDownloadStream(id, { start, end } = {}) {
    const options = {};
    if (start !== undefined) options.start = start;
    if (end !== undefined) options.end = end;
    return this._bucket().openDownloadStream(id, options);
  }

  async deleteById(id) {
    await this._bucket().delete(id);
  }
}

module.exports = new FileRepository();
