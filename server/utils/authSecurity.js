const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');

const SESSION_COOKIE = 'dlas_session';
const CSRF_COOKIE = 'dlas_csrf';
const SESSION_DURATION = process.env.JWT_EXPIRES_IN || '12h';

function durationMs(value) {
  const match = /^(\d+)(s|m|h|d)$/.exec(String(value));
  if (!match) return 12 * 60 * 60 * 1000;
  const factors = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return Number(match[1]) * factors[match[2]];
}

function cookieOptions(httpOnly, maxAge) {
  return {
    httpOnly,
    secure: process.env.NODE_ENV === 'production' || process.env.DLAS_FREE_DEMO === 'true',
    sameSite: 'strict',
    path: httpOnly ? '/api' : '/',
    ...(maxAge ? { maxAge } : {}),
  };
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const entry of raw.split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    if (entry.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(entry.slice(separator + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

function csrfToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function setCsrfCookie(res) {
  const value = csrfToken();
  res.cookie(CSRF_COOKIE, value, cookieOptions(false, durationMs(SESSION_DURATION)));
  return value;
}

function safeEqual(first, second) {
  if (typeof first !== 'string' || typeof second !== 'string') return false;
  const a = Buffer.from(first);
  const b = Buffer.from(second);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireCsrf(req, res) {
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.get('x-csrf-token');
  if (safeEqual(cookie, header)) return true;
  res.status(403).json({ success: false, message: 'Security token expired. Refresh the page and try again.' });
  return false;
}

function issueSession(res, user, req) {
  const id = crypto.randomUUID();
  const maxAge = durationMs(SESSION_DURATION);
  const expiresAt = new Date(Date.now() + maxAge).toISOString();
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: id },
    process.env.JWT_SECRET,
    { expiresIn: SESSION_DURATION }
  );
  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, user_agent, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(id, user.id, String(req.get('user-agent') || '').slice(0, 500) || null, expiresAt);
  res.cookie(SESSION_COOKIE, token, cookieOptions(true, maxAge));
  setCsrfCookie(res);
  return id;
}

function revokeSession(id, userId) {
  if (!id) return;
  db.prepare(`UPDATE auth_sessions SET revoked_at = datetime('now') WHERE id = ? AND user_id = ? AND revoked_at IS NULL`).run(id, userId);
}

function revokeUserSessions(userId, exceptId = null) {
  db.prepare(`
    UPDATE auth_sessions SET revoked_at = datetime('now')
    WHERE user_id = ? AND revoked_at IS NULL AND (? IS NULL OR id != ?)
  `).run(userId, exceptId, exceptId);
}

function clearSessionCookies(res) {
  res.clearCookie(SESSION_COOKIE, cookieOptions(true));
  res.clearCookie(CSRF_COOKIE, cookieOptions(false));
}

function encryptionKey() {
  const configured = process.env.MFA_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (/^[a-f0-9]{64}$/i.test(configured)) return Buffer.from(configured, 'hex');
  return crypto.createHash('sha256').update(configured).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

function decryptSecret(value) {
  const [ivText, tagText, encryptedText] = String(value || '').split('.');
  if (!ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted MFA secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function generateTotpSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.randomBytes(20);
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(buffer >> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const character of input.toUpperCase().replace(/=+$/, '')) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error('Invalid TOTP secret');
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpAt(secret, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function verifyTotp(secret, submitted, now = Date.now()) {
  const code = String(submitted || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(now / 30_000);
  for (const drift of [-1, 0, 1]) {
    if (safeEqual(totpAt(secret, counter + drift), code)) return true;
  }
  return false;
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  SESSION_DURATION,
  durationMs,
  readCookie,
  setCsrfCookie,
  requireCsrf,
  issueSession,
  revokeSession,
  revokeUserSessions,
  clearSessionCookies,
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  verifyTotp,
};
