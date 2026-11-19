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

// Normalizes subaddressing (+tag) on all domains and Google dot-insensitivity so a student
// cannot register alt accounts pointing to the same inbox to farm extra attempts.
function canonicalEmail(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0) return email;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

function findCanonicalEmailConflict(db, email, excludeUserId = null) {
  const canonical = canonicalEmail(email);
  const at = canonical.lastIndexOf('@');
  if (at <= 0) return null;
  const domain = canonical.slice(at + 1);
  const domains = domain === 'gmail.com' ? ['gmail.com', 'googlemail.com'] : [domain];
  const candidates = db.prepare(
    `SELECT id, email FROM users WHERE (${domains.map(() => 'lower(email) LIKE ?').join(' OR ')})`
  ).all(...domains.map((item) => `%@${item}`));
  return candidates.find((row) => row.id !== excludeUserId && canonicalEmail(row.email) === canonical) || null;
}

function requireCsrf(req, res) {
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.get('x-csrf-token');
  if (safeEqual(cookie, header)) return true;
  res.status(403).json({ success: false, message: 'Security token expired. Refresh the page and try again.' });
  return false;
}

function issueSession(res, user, req, { mfaVerified = false } = {}) {
  if (!user || !['admin', 'respondent'].includes(user.role) || user.status !== 'active') {
    const error = new Error('Account is not permitted to sign in. Contact administrator.');
    error.status = 403;
    throw error;
  }
  const id = crypto.randomUUID();
  const maxAge = durationMs(SESSION_DURATION);
  const expiresAt = new Date(Date.now() + maxAge).toISOString();
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, jti: id },
    process.env.JWT_SECRET,
    { expiresIn: SESSION_DURATION }
  );
  db.prepare(`
    INSERT INTO auth_sessions (id, user_id, user_agent, expires_at, mfa_verified)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, user.id, String(req.get('user-agent') || '').slice(0, 500) || null, expiresAt, mfaVerified ? 1 : 0);
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

// Run within the transaction that changes credentials or account access.
function invalidatePendingAuthentication(userId) {
  db.prepare('DELETE FROM mfa_challenges WHERE user_id = ?').run(userId);
  db.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE user_id = ? AND token_type = 'password_reset' AND used_at IS NULL").run(userId);
  db.prepare("UPDATE mfa_recovery_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(userId);
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

function generateEmailOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function hashCode(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeBackupCode(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

function generateBackupCodes(count = 8) {
  // Unambiguous Crockford-like character set (no 0/O or 1/I/L).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const plainCodes = [];
  const seen = new Set();
  while (plainCodes.length < count) {
    let raw = '';
    for (let i = 0; i < 8; i++) {
      raw += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    if (seen.has(raw)) continue;
    seen.add(raw);
    plainCodes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return {
    plainCodes,
    hashedCodes: plainCodes.map((code) => hashCode(normalizeBackupCode(code))),
  };
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  SESSION_DURATION,
  durationMs,
  readCookie,
  setCsrfCookie,
  requireCsrf,
  safeEqual,
  canonicalEmail,
  findCanonicalEmailConflict,
  issueSession,
  revokeSession,
  revokeUserSessions,
  invalidatePendingAuthentication,
  clearSessionCookies,
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  verifyTotp,
  generateEmailOtp,
  hashCode,
  normalizeBackupCode,
  generateBackupCodes,
};
