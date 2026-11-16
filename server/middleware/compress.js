const compression = require('compression');

const COMPRESSIBLE_RE = /^(text\/(?!event-stream)|application\/(?:json|javascript|ecmascript|xml|xhtml\+xml)|image\/svg\+xml)/i;
const MIN_COMPRESS_BYTES = 1024;

function compressResponses(options = {}) {
  const threshold = Number.isFinite(options.threshold) ? options.threshold : MIN_COMPRESS_BYTES;
  // Delegate stream flow control to the maintained middleware. A producer piping
  // into res must resume when compression drains, even if the compressed output
  // is small enough that the underlying HTTP response never emits drain itself.
  return compression({
    threshold,
    filter(req, res) {
      if (req.method === 'HEAD' || req.headers.range || req.headers['x-no-compression']
        || !/\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''))
        || res.statusCode < 200 || [204, 205, 304].includes(res.statusCode)) return false;
      const contentType = String(res.getHeader('Content-Type') || '').split(';')[0].trim();
      return COMPRESSIBLE_RE.test(contentType) && compression.filter(req, res);
    },
  });
}

module.exports = { compressResponses };
