/**
 * Streams a file from FileStorageService.getFile() to the response, honoring a
 * single HTTP Range request (needed for seeking in <video>).
 */
function sendStoredFile(req, res, file, { cacheControl = 'private, no-store' } = {}) {
  const total = file.length;
  res.set('Content-Type', file.contentType);
  res.set('Accept-Ranges', 'bytes');
  res.set('Cache-Control', cacheControl);
  if (file.uploadDate) res.set('Last-Modified', new Date(file.uploadDate).toUTCString());

  let start = 0;
  let end = total - 1;
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && total > 0) {
    if (range[1] === '') {
      start = Math.max(0, total - Number(range[2])); // suffix range: last N bytes
    } else {
      start = Number(range[1]);
      if (range[2] !== '') end = Math.min(Number(range[2]), total - 1);
    }
    if (start > end || start >= total) {
      res.set('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    res.status(206);
    res.set('Content-Range', `bytes ${start}-${end}/${total}`);
  }

  res.set('Content-Length', String(total === 0 ? 0 : end - start + 1));
  if (req.method === 'HEAD' || total === 0) return res.end();

  const stream = file.openStream({ start, end: end + 1 });
  // Seeking in a <video> aborts earlier requests; stop reading from MongoDB when that happens.
  res.once('close', () => stream.destroy());
  stream.once('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[sendStoredFile] stream error:', err.message);
    if (!res.headersSent) res.status(500).end();
    else res.destroy(err);
  });
  return stream.pipe(res);
}

module.exports = sendStoredFile;
