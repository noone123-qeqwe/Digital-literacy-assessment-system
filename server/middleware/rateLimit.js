const crypto = require('crypto');
const { db } = require('../db/database');

function rateLimit({ id, windowMs, max, message, keyFn }) {
  const limiterId = id || 'default';
  let cleanupScheduled = false;
  const incrementBucket = db.prepare(`
    INSERT INTO rate_limit_buckets (bucket_key, hit_count, reset_at)
    VALUES (?, 1, ?)
    ON CONFLICT(bucket_key) DO UPDATE SET
      hit_count = CASE WHEN reset_at <= ? THEN 1 ELSE hit_count + 1 END,
      reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
    RETURNING hit_count, reset_at
  `);
  return (req, res, next) => {
    const now = Date.now();
    const rawKey = keyFn ? keyFn(req) : undefined;
    if (keyFn && !rawKey) return next();
    const identity = rawKey || req.ip || req.socket.remoteAddress || 'unknown';
    const identityHash = crypto.createHmac('sha256', process.env.JWT_SECRET || 'dlas-local-rate-limit-key')
      .update(String(identity))
      .digest('hex');
    const key = `${limiterId}:${identityHash}`;
    const resetAt = now + windowMs;
    const bucket = incrementBucket.get(key, resetAt, now, now, resetAt);

    if (!cleanupScheduled) {
      cleanupScheduled = true;
      const cleanup = setTimeout(() => {
        db.prepare('DELETE FROM rate_limit_buckets WHERE reset_at <= ?').run(Date.now());
        cleanupScheduled = false;
      }, Math.min(windowMs, 60_000));
      cleanup.unref?.();
    }

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - bucket.hit_count));
    res.setHeader('RateLimit-Reset', Math.ceil(bucket.reset_at / 1000));
    if (bucket.hit_count > max) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((bucket.reset_at - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    return next();
  };
}

module.exports = { rateLimit };
