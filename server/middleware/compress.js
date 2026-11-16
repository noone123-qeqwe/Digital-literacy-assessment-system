const zlib = require('node:zlib');

const COMPRESSIBLE_RE = /^(text\/(?!event-stream)|application\/(?:json|javascript|ecmascript|xml|xhtml\+xml)|image\/svg\+xml)/i;
const MIN_COMPRESS_BYTES = 1024;

function normalizeBuffer(chunk, encoding) {
  if (chunk === undefined || chunk === null) return null;
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, typeof encoding === 'string' ? encoding : 'utf8');
  return Buffer.from(chunk);
}

function isCompressibleResponse(res) {
  if (res.headersSent) return false;
  if (res.statusCode < 200 || res.statusCode === 204 || res.statusCode === 205 || res.statusCode === 304) {
    return false;
  }
  if (res.getHeader('Content-Encoding')) return false;

  const cacheControl = String(res.getHeader('Cache-Control') || '');
  if (/\bno-transform\b/i.test(cacheControl)) return false;

  const contentType = String(res.getHeader('Content-Type') || '').split(';')[0].trim();
  return COMPRESSIBLE_RE.test(contentType);
}

function prepareCompressedHeaders(res) {
  res.setHeader('Content-Encoding', 'gzip');
  res.removeHeader('Content-Length');
  const etag = res.getHeader('ETag');
  if (typeof etag === 'string' && !etag.startsWith('W/')) {
    res.setHeader('ETag', `W/${etag}`);
  }
}

function compressResponses(options = {}) {
  const threshold = Number.isFinite(options.threshold) ? options.threshold : MIN_COMPRESS_BYTES;

  return function compressMiddleware(req, res, next) {
    if (
      req.method === 'HEAD' ||
      req.headers.range ||
      req.headers['x-no-compression'] ||
      !/\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''))
    ) {
      return next();
    }

    if (typeof res.vary === 'function') {
      res.vary('Accept-Encoding');
    } else if (!res.headersSent) {
      const existingVary = String(res.getHeader('Vary') || '');
      if (!/\bAccept-Encoding\b/i.test(existingVary)) {
        res.setHeader('Vary', existingVary ? `${existingVary}, Accept-Encoding` : 'Accept-Encoding');
      }
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);

    let mode = null; // null | 'passthrough' | 'gzip-stream'
    let gzipStream = null;
    let streamError = false;
    let closed = false;
    let endCalled = false;
    let endCallback;
    let bufferedChunks = [];
    let bufferedLength = 0;

    function finishGzipStream() {
      if (endCalled || res.writableEnded || res.destroyed) return;
      endCalled = true;
      originalEnd(endCallback);
    }

    res.once('close', () => {
      closed = true;
      bufferedChunks = [];
      bufferedLength = 0;
      if (gzipStream && !gzipStream.destroyed) {
        gzipStream.destroy();
      }
    });

    function startGzipStream() {
      mode = 'gzip-stream';
      prepareCompressedHeaders(res);
      gzipStream = zlib.createGzip({ level: zlib.constants.Z_DEFAULT_COMPRESSION });

      gzipStream.on('data', (compressedChunk) => {
        if (!streamError && !closed) originalWrite(compressedChunk);
      });
      gzipStream.once('end', finishGzipStream);
      gzipStream.once('error', () => {
        streamError = true;
        if (gzipStream && !gzipStream.destroyed) gzipStream.destroy();
        finishGzipStream();
      });

      for (const buffered of bufferedChunks) {
        gzipStream.write(buffered);
      }
      bufferedChunks = [];
      bufferedLength = 0;
    }

    function flushPassthrough() {
      mode = 'passthrough';
      for (const buffered of bufferedChunks) {
        originalWrite(buffered);
      }
      bufferedChunks = [];
      bufferedLength = 0;
    }

    res.write = function wrappedWrite(chunk, encoding, callback) {
      let enc = encoding;
      let cb = callback;
      if (typeof enc === 'function') {
        cb = enc;
        enc = undefined;
      }

      if (mode === 'passthrough') {
        return originalWrite(chunk, enc, cb);
      }

      const buf = normalizeBuffer(chunk, enc);
      if (mode === 'gzip-stream') {
        if (!buf || buf.length === 0) {
          if (cb) cb();
          return true;
        }
        return gzipStream.write(buf, cb);
      }

      if (!isCompressibleResponse(res)) {
        flushPassthrough();
        return originalWrite(chunk, enc, cb);
      }

      const declaredLength = Number(res.getHeader('Content-Length'));
      if (Number.isFinite(declaredLength) && declaredLength > 0 && declaredLength < threshold) {
        flushPassthrough();
        return originalWrite(chunk, enc, cb);
      }

      if (buf && buf.length > 0) {
        bufferedChunks.push(buf);
        bufferedLength += buf.length;
      }

      if (bufferedLength >= threshold || (Number.isFinite(declaredLength) && declaredLength >= threshold)) {
        startGzipStream();
      }

      if (cb) cb();
      return true;
    };

    res.end = function wrappedEnd(chunk, encoding, callback) {
      let data = chunk;
      let enc = encoding;
      let cb = callback;
      if (typeof data === 'function') {
        cb = data;
        data = undefined;
        enc = undefined;
      } else if (typeof enc === 'function') {
        cb = enc;
        enc = undefined;
      }

      if (mode === 'passthrough') {
        return originalEnd(data, enc, cb);
      }

      const finalBuf = normalizeBuffer(data, enc);
      if (mode === 'gzip-stream') {
        endCallback = cb;
        if (streamError || closed) {
          finishGzipStream();
          return res;
        }
        if (finalBuf && finalBuf.length > 0) {
          gzipStream.end(finalBuf);
        } else {
          gzipStream.end();
        }
        return res;
      }

      if (finalBuf && finalBuf.length > 0) {
        bufferedChunks.push(finalBuf);
        bufferedLength += finalBuf.length;
      }

      if (!isCompressibleResponse(res) || bufferedLength < threshold) {
        mode = 'passthrough';
        const payload = bufferedChunks.length === 0
          ? undefined
          : bufferedChunks.length === 1
          ? bufferedChunks[0]
          : Buffer.concat(bufferedChunks);
        bufferedChunks = [];
        bufferedLength = 0;
        return payload !== undefined ? originalEnd(payload, cb) : originalEnd(cb);
      }

      const payload = bufferedChunks.length === 1 ? bufferedChunks[0] : Buffer.concat(bufferedChunks);
      bufferedChunks = [];
      bufferedLength = 0;

      prepareCompressedHeaders(res);
      zlib.gzip(payload, (err, compressed) => {
        if (closed || res.writableEnded || res.destroyed) return;
        if (err) {
          if (!res.headersSent) res.removeHeader('Content-Encoding');
          originalEnd(payload, cb);
          return;
        }
        if (!res.headersSent) {
          res.setHeader('Content-Length', String(compressed.length));
        }
        originalEnd(compressed, cb);
      });
      return res;
    };

    return next();
  };
}

module.exports = { compressResponses };
