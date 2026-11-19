const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { db, logActivity } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { defaults: characterDefaults, validateCharacterSettings } = require('../utils/dashboardCharacter');
const { rateLimit } = require('../middleware/rateLimit');
const {
  issueSession, revokeSession, revokeUserSessions, clearSessionCookies,
  encryptSecret, decryptSecret, generateTotpSecret, verifyTotp, safeEqual,
  canonicalEmail, findCanonicalEmailConflict,
  generateEmailOtp, hashCode, normalizeBackupCode, generateBackupCodes,
} = require('../utils/authSecurity');
const { sendSecurityEmail, clientUrl } = require('../utils/email');
const { enrollPublishedQuizzes } = require('../utils/quizEnrollment');
const { isMfaRequired } = require('../utils/mfaPolicy');

const loginLimit = rateLimit({ id: 'auth-login', windowMs: 15 * 60 * 1000, max: 10, message: 'Too many sign-in attempts. Try again in 15 minutes.' });
const loginAccountLimit = rateLimit({
  id: 'auth-login-account',
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many sign-in attempts for this account. Try again in 15 minutes.',
  keyFn: (req) => canonicalEmail(req.body?.email || ''),
});
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 12);
const registrationLimit = rateLimit({ id: 'auth-register', windowMs: 60 * 60 * 1000, max: 10, message: 'Too many registration attempts. Try again later.' });
const tokenRequestLimit = rateLimit({ id: 'auth-token-request', windowMs: 60 * 60 * 1000, max: 5, message: 'Too many requests. Try again later.' });
// Redeeming a one-time link must not spend the email-request quota. Several
// students can share a network, and account setup may use both link types.
const tokenUseLimit = rateLimit({ id: 'auth-token-use', windowMs: 15 * 60 * 1000, max: 30, message: 'Too many link verification attempts. Try again in 15 minutes.' });
const mfaLimit = rateLimit({ id: 'auth-mfa', windowMs: 15 * 60 * 1000, max: 10, message: 'Too many verification attempts. Try again later.' });
const MAX_PROFILE_PICTURE_BYTES = 700 * 1024;

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    role: user.role,
  };
}

async function createEmailToken(userId, tokenType) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + (tokenType === 'password_reset' ? 30 : 24 * 60) * 60_000).toISOString();
  db.prepare(`UPDATE auth_tokens SET used_at = datetime('now') WHERE user_id = ? AND token_type = ? AND used_at IS NULL`).run(userId, tokenType);
  db.prepare(`INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at) VALUES (?, ?, ?, ?)`).run(userId, tokenHash, tokenType, expiresAt);
  return token;
}

function verifiedUserForToken(token, tokenType) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return db.prepare(`
    SELECT t.id AS token_id, u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.mfa_enabled,
           COALESCE(mfa_policy.setting_value, '0') AS mfa_optional
    FROM auth_tokens t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN system_settings mfa_policy ON mfa_policy.setting_key = 'mfa_optional_user:' || u.id
    WHERE t.token_hash = ? AND t.token_type = ? AND t.used_at IS NULL
      AND datetime(t.expires_at) > datetime('now') AND u.status = 'active' AND u.role IN ('admin', 'respondent')
  `).get(tokenHash, tokenType) || null;
}

function createMfaRecoveryToken(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  db.prepare("UPDATE mfa_recovery_tokens SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL").run(userId);
  db.prepare('INSERT INTO mfa_recovery_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(userId, tokenHash, expiresAt);
  return token;
}

function verifiedMfaRecoveryToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return db.prepare(`
    SELECT t.id AS token_id, u.id, u.email, u.first_name, u.last_name, u.role
    FROM mfa_recovery_tokens t JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ? AND t.used_at IS NULL
      AND datetime(t.expires_at) > datetime('now') AND u.status = 'active'
  `).get(tokenHash) || null;
}

function maskEmail(email = '') {
  const [local = '', domain = ''] = String(email).split('@');
  if (!domain) return '';
  const head = local.slice(0, 1);
  const tail = local.length > 2 ? local.slice(-1) : '';
  return `${head}***${tail}@${domain}`;
}

function createEmailOtpChallenge(userId) {
  const id = crypto.randomBytes(32).toString('base64url');
  const otpCode = generateEmailOtp();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  db.prepare(`DELETE FROM mfa_challenges WHERE user_id = ? AND challenge_type = 'login'`).run(userId);
  db.prepare(`INSERT INTO mfa_challenges (id, user_id, challenge_type, otp_hash, expires_at) VALUES (?, ?, 'login', ?, ?)`)
    .run(id, userId, hashCode(otpCode), expiresAt);
  return { id, otpCode };
}

function saveBackupCodesForUser(userId) {
  const { plainCodes, hashedCodes } = generateBackupCodes(8);
  db.transaction(() => {
    db.prepare('DELETE FROM mfa_backup_codes WHERE user_id = ?').run(userId);
    const insert = db.prepare('INSERT INTO mfa_backup_codes (user_id, code_hash) VALUES (?, ?)');
    for (const digest of hashedCodes) insert.run(userId, digest);
  })();
  return plainCodes;
}

function backupCodesRemainingCount(userId) {
  return db.prepare('SELECT COUNT(*) AS count FROM mfa_backup_codes WHERE user_id = ? AND used_at IS NULL').get(userId)?.count || 0;
}

function cleanUserForSession(userId) {
  return db.prepare(`SELECT id, email, first_name, last_name, role, status, email_verified, mfa_enabled, created_at, updated_at FROM users WHERE id = ?`).get(userId);
}

function matchesImageSignature(imageBuffer, mimeType) {
  if (mimeType === 'image/png') {
    return imageBuffer.length >= 8 && imageBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === 'image/jpeg') {
    return imageBuffer.length >= 3 && imageBuffer[0] === 0xff && imageBuffer[1] === 0xd8 && imageBuffer[2] === 0xff;
  }
  if (mimeType === 'image/webp') {
    return imageBuffer.length >= 12
      && imageBuffer.toString('ascii', 0, 4) === 'RIFF'
      && imageBuffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

// POST /api/auth/login
router.post('/login', loginLimit, loginAccountLimit, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { email, password } = req.body;
  try {
  const user = db.prepare(
    "SELECT u.*, COALESCE(mfa_policy.setting_value, '0') AS mfa_optional FROM users u"
    + " LEFT JOIN system_settings mfa_policy ON mfa_policy.setting_key = 'mfa_optional_user:' || u.id"
    + ' WHERE u.email = ?'
  ).get(email);

  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  if (!['admin', 'respondent'].includes(user.role) || user.status !== 'active') {
    return res.status(403).json({ success: false, message: 'Account is deactivated. Contact administrator.' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  if (!user.email_verified) {
    return res.status(403).json({
      success: false,
      verificationRequired: true,
      message: 'Verify your email address before signing in. Use the link sent to your inbox.',
    });
  }

  if (isMfaRequired(user)) {
    const { id: challengeId, otpCode } = createEmailOtpChallenge(user.id);
    await sendSecurityEmail({
      to: user.email,
      subject: 'Your DLAS sign-in verification code',
      text: 'Enter this 6-digit verification code to complete your Digital Literacy Assessment System sign-in.',
      otpCode,
    });
    return res.json({
      success: true,
      mfaRequired: true,
      challengeId,
      maskedEmail: maskEmail(user.email),
      methods: {
        emailOtp: true,
        totp: Boolean(user.mfa_enabled && user.mfa_secret),
        backupCode: backupCodesRemainingCount(user.id) > 0,
      },
    });
  }

  issueSession(res, user, req, { mfaVerified: false });
  logActivity(user.id, 'LOGIN', 'User logged in');

  return res.json({
    success: true,
    message: 'Login successful',
    data: { user: publicUser(user) },
  });
  } catch (err) {
    return next(err);
  }
});

// POST /api/auth/register
router.post('/register', registrationLimit, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 10, max: 128 }).withMessage('Password must be between 10 and 128 characters'),
  body('first_name').trim().isLength({ min: 1, max: 100 }).withMessage('First name is required and must be at most 100 characters'),
  body('last_name').trim().isLength({ min: 1, max: 100 }).withMessage('Last name is required and must be at most 100 characters'),
  body('institutional_id').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 64 }).matches(/^[a-zA-Z0-9._/-]+$/).withMessage('Student ID may contain letters, numbers, dots, slashes, dashes, and underscores.'),
  body('role').optional().equals('respondent').withMessage('Public registration is limited to respondent accounts'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { email, password, first_name, last_name } = req.body;
  const institutionalId = String(req.body.institutional_id || '').trim().toUpperCase() || null;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) || findCanonicalEmailConflict(db, email);
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already registered.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const createAccount = db.transaction(() => {
      const result = db.prepare(
        "INSERT INTO users (email, password, first_name, last_name, role, email_verified, institutional_id) VALUES (?, ?, ?, ?, 'respondent', 0, ?)"
      ).run(email, hashedPassword, first_name, last_name, institutionalId);
      db.prepare('INSERT INTO respondent_profiles (user_id) VALUES (?)').run(result.lastInsertRowid);
      logActivity(result.lastInsertRowid, 'REGISTER', 'New respondent account created');
      return result.lastInsertRowid;
    });
    const id = createAccount();
    const token = await createEmailToken(id, 'email_verification');
    await sendSecurityEmail({
      to: email,
      subject: 'Verify your DLAS account',
      text: 'Confirm your email address to activate your Digital Literacy Assessment System account.',
      actionUrl: clientUrl(`/verify-email?token=${encodeURIComponent(token)}`),
    });

    return res.status(201).json({
      success: true,
      message: 'Account created. Check your email for the verification link before signing in.',
      verificationRequired: true,
      data: { user: { id, email, first_name, last_name, role: 'respondent' } },
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.errcode === 2067) {
      if (institutionalId && db.prepare('SELECT id FROM users WHERE institutional_id = ?').get(institutionalId)) {
        return res.status(409).json({ success: false, message: 'Student ID is already registered.' });
      }
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }
    return next(err);
  }
});

// Email verification and password recovery use one-time, expiring tokens stored only as hashes.
router.post('/verify-email', tokenUseLimit, [body('token').isString().isLength({ min: 20, max: 200 })], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Verification link is invalid or expired.' });
  const token = verifiedUserForToken(req.body.token, 'email_verification');
  if (!token) return res.status(400).json({ success: false, message: 'Verification link is invalid or expired.' });
  db.transaction(() => {
    db.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?").run(token.token_id);
    db.prepare("UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?").run(token.id);
    enrollPublishedQuizzes(db, token.id);
  })();
  logActivity(token.id, 'EMAIL_VERIFIED', 'Email address verified');
  if (!isMfaRequired(token)) {
    issueSession(res, token, req, { mfaVerified: false });
    return res.json({
      success: true,
      signedIn: true,
      message: 'Email verified. Redirecting to your dashboard…',
      data: { user: publicUser(token) },
    });
  }
  return res.json({
    success: true,
    signedIn: false,
    message: 'Email verified. Sign in to complete two-step verification.',
  });
});

router.post('/resend-verification', tokenRequestLimit, [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const user = db.prepare('SELECT id, email, first_name, email_verified FROM users WHERE email = ? AND status = ?').get(req.body.email, 'active');
    if (user && !user.email_verified) {
      const token = await createEmailToken(user.id, 'email_verification');
      await sendSecurityEmail({
        to: user.email,
        subject: 'Verify your DLAS account',
        text: 'Confirm your email address to activate your account.',
        actionUrl: clientUrl(`/verify-email?token=${encodeURIComponent(token)}`),
      });
    }
    return res.json({ success: true, message: 'If the account needs verification, a new link has been sent.' });
  } catch (err) { return next(err); }
});

router.post('/forgot-password', tokenRequestLimit, [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const user = db.prepare('SELECT id, email FROM users WHERE email = ? AND status = ?').get(req.body.email, 'active');
    if (user) {
      const token = await createEmailToken(user.id, 'password_reset');
      await sendSecurityEmail({
        to: user.email,
        subject: 'Reset your DLAS password',
        text: 'A password reset was requested for your account. The link expires in 30 minutes.',
        actionUrl: clientUrl(`/reset-password?token=${encodeURIComponent(token)}`),
      });
    }
    return res.json({ success: true, message: 'If an active account uses that email, a password reset link has been sent.' });
  } catch (err) { return next(err); }
});

router.post('/mfa/recovery-request', tokenRequestLimit, [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const user = db.prepare("SELECT id, email, role FROM users WHERE email = ? AND status = 'active'").get(req.body.email);
    if (user && ['admin'].includes(user.role)) {
      const token = createMfaRecoveryToken(user.id);
      await sendSecurityEmail({
        to: user.email,
        subject: 'Reset DLAS authenticator access',
        text: 'A request was made to reset the authenticator linked to your privileged DLAS account. This one-time link expires in 30 minutes. You will need to enroll an authenticator again before signing in.',
        actionUrl: clientUrl(`/recover-mfa?token=${encodeURIComponent(token)}`),
      });
    }
    return res.json({ success: true, message: 'If that is an active administrator account, an MFA recovery link has been sent.' });
  } catch (err) { return next(err); }
});

router.post('/mfa/recover', tokenUseLimit, [body('token').isString().isLength({ min: 20, max: 200 })], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'MFA recovery link is invalid or expired.' });
  const token = verifiedMfaRecoveryToken(req.body.token);
  if (!token || !['admin'].includes(token.role)) return res.status(400).json({ success: false, message: 'MFA recovery link is invalid or expired.' });
  db.transaction(() => {
    db.prepare("UPDATE mfa_recovery_tokens SET used_at = datetime('now') WHERE id = ?").run(token.token_id);
    db.prepare("UPDATE users SET mfa_secret = NULL, mfa_enabled = 0, updated_at = datetime('now') WHERE id = ?").run(token.id);
    db.prepare("UPDATE auth_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(token.id);
    db.prepare('DELETE FROM mfa_challenges WHERE user_id = ?').run(token.id);
  })();
  logActivity(token.id, 'MFA_RECOVERED', 'MFA was reset by email recovery; re-enrollment is required');
  return res.json({ success: true, message: 'Authenticator access was reset. Sign in with your password to set up MFA again.' });
});

router.post('/reset-password', tokenUseLimit, [
  body('token').isString().isLength({ min: 20, max: 200 }),
  body('new_password').isLength({ min: 10, max: 128 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'A valid reset link and a password of at least 10 characters are required.' });
    const token = verifiedUserForToken(req.body.token, 'password_reset');
    if (!token) return res.status(400).json({ success: false, message: 'Reset link is invalid or expired.' });
    const passwordHash = await bcrypt.hash(req.body.new_password, 12);
    db.transaction(() => {
      db.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE id = ?").run(token.token_id);
      db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?").run(passwordHash, token.id);
      db.prepare("UPDATE auth_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(token.id);
    })();
    logActivity(token.id, 'PASSWORD_RESET', 'Password reset by email');
    return res.json({ success: true, message: 'Password reset. You can sign in with your new password.' });
  } catch (err) { return next(err); }
});

router.post('/mfa/resend-otp', tokenRequestLimit, [
  body('challenge_id').isString().isLength({ min: 30, max: 100 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Verification session expired. Sign in again.' });
  }
  try {
    const challenge = db.prepare(`
      SELECT c.id, c.user_id, u.email, u.status
      FROM mfa_challenges c JOIN users u ON u.id = c.user_id
      WHERE c.id = ? AND c.challenge_type = 'login' AND datetime(c.expires_at) > datetime('now')
    `).get(req.body.challenge_id);
    if (!challenge || challenge.status !== 'active') {
      return res.status(401).json({ success: false, message: 'The verification challenge expired. Sign in again.' });
    }
    const otpCode = generateEmailOtp();
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    db.prepare('UPDATE mfa_challenges SET otp_hash = ?, attempts = 0, expires_at = ? WHERE id = ?')
      .run(hashCode(otpCode), expiresAt, challenge.id);
    await sendSecurityEmail({
      to: challenge.email,
      subject: 'Your DLAS sign-in verification code',
      text: 'Enter this 6-digit verification code to complete your Digital Literacy Assessment System sign-in.',
      otpCode,
    });
    return res.json({ success: true, message: 'A new 6-digit verification code has been sent to your email.' });
  } catch (err) {
    return next(err);
  }
});

router.post('/mfa/verify', mfaLimit, [
  body('challenge_id').isString().isLength({ min: 30, max: 100 }),
  body('code').isString().trim().isLength({ min: 6, max: 16 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Enter a valid 6-digit code or backup scratch code.' });
  }
  const challenge = db.prepare(`
    SELECT c.id, c.user_id, c.attempts, c.otp_hash, u.mfa_secret, u.mfa_enabled
    FROM mfa_challenges c JOIN users u ON u.id = c.user_id
    WHERE c.id = ? AND c.challenge_type = 'login' AND datetime(c.expires_at) > datetime('now')
  `).get(req.body.challenge_id);
  if (!challenge || challenge.attempts >= 5) {
    return res.status(401).json({ success: false, message: 'The verification challenge expired. Sign in again.' });
  }

  const trimmed = String(req.body.code || '').replace(/\s/g, '');
  let verifiedMethod = null;
  let usedBackupCodeId = null;

  if (/^\d{6}$/.test(trimmed)) {
    if (challenge.otp_hash && safeEqual(challenge.otp_hash, hashCode(trimmed))) {
      verifiedMethod = 'email_otp';
    } else if (challenge.mfa_enabled && challenge.mfa_secret) {
      try {
        if (verifyTotp(decryptSecret(challenge.mfa_secret), trimmed)) {
          verifiedMethod = 'totp';
        }
      } catch {}
    }
  } else {
    const normalized = normalizeBackupCode(trimmed);
    if (normalized.length >= 6 && normalized.length <= 12) {
      const digest = hashCode(normalized);
      const unusedCodes = db.prepare('SELECT id, code_hash FROM mfa_backup_codes WHERE user_id = ? AND used_at IS NULL').all(challenge.user_id);
      const match = unusedCodes.find((row) => safeEqual(row.code_hash, digest));
      if (match) {
        verifiedMethod = 'backup_code';
        usedBackupCodeId = match.id;
      }
    }
  }

  if (!verifiedMethod) {
    db.prepare('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?').run(challenge.id);
    return res.status(401).json({ success: false, message: 'Verification code is incorrect.' });
  }

  db.transaction(() => {
    if (usedBackupCodeId) {
      db.prepare("UPDATE mfa_backup_codes SET used_at = datetime('now') WHERE id = ? AND used_at IS NULL").run(usedBackupCodeId);
    }
    db.prepare('DELETE FROM mfa_challenges WHERE id = ?').run(challenge.id);
  })();

  const user = cleanUserForSession(challenge.user_id);
  const remainingBackupCodes = backupCodesRemainingCount(user.id);
  issueSession(res, user, req, { mfaVerified: true });
  logActivity(
    user.id,
    'LOGIN',
    verifiedMethod === 'backup_code'
      ? 'User completed sign-in with a backup scratch code'
      : verifiedMethod === 'totp'
        ? 'User completed sign-in with an authenticator code'
        : 'User completed sign-in with an email verification code'
  );
  return res.json({
    success: true,
    message: 'Sign-in successful',
    data: {
      user: { ...user, backup_codes_remaining: remainingBackupCodes },
      verifiedMethod,
      remainingBackupCodes,
    },
  });
});

router.post('/mfa/setup', mfaLimit, [body('setup_token').isString().isLength({ min: 20, max: 2000 })], (req, res) => {
  let decoded;
  try { decoded = jwt.verify(req.body.setup_token, process.env.JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Setup session expired. Sign in again.' });
  }
  const user = db.prepare("SELECT id, email, role, status, email_verified FROM users WHERE id = ?").get(decoded.id);
  if (decoded.scope !== 'mfa_setup' || !user || user.status !== 'active' || !user.email_verified || !['admin'].includes(user.role)) {
    return res.status(403).json({ success: false, message: 'MFA setup is not available for this account.' });
  }
  const secret = generateTotpSecret();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  db.prepare("DELETE FROM mfa_challenges WHERE user_id = ? AND challenge_type = 'setup'").run(user.id);
  db.prepare("INSERT INTO mfa_challenges (id, user_id, challenge_type, secret_encrypted, expires_at) VALUES (?, ?, 'setup', ?, ?)")
    .run(crypto.randomBytes(24).toString('base64url'), user.id, encryptSecret(secret), expiresAt);
  const label = encodeURIComponent(`DLAS:${user.email}`);
  const issuer = encodeURIComponent('Digital Literacy Assessment System');
  return res.json({ success: true, data: { secret, otpauth_url: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` } });
});

router.post('/mfa/setup/confirm', mfaLimit, [
  body('setup_token').isString().isLength({ min: 20, max: 2000 }),
  body('code').isString().isLength({ min: 6, max: 8 }),
], (req, res) => {
  let decoded;
  try { decoded = jwt.verify(req.body.setup_token, process.env.JWT_SECRET); } catch {
    return res.status(401).json({ success: false, message: 'Setup session expired. Sign in again.' });
  }
  const challenge = db.prepare(`
    SELECT id, user_id, secret_encrypted, attempts FROM mfa_challenges
    WHERE user_id = ? AND challenge_type = 'setup' AND datetime(expires_at) > datetime('now')
  `).get(decoded.id);
  if (decoded.scope !== 'mfa_setup' || !challenge || challenge.attempts >= 5) {
    return res.status(401).json({ success: false, message: 'MFA setup expired. Sign in again.' });
  }
  let secret;
  let isValid = false;
  try { secret = decryptSecret(challenge.secret_encrypted); isValid = verifyTotp(secret, req.body.code); } catch {}
  if (!isValid) {
    db.prepare('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?').run(challenge.id);
    return res.status(401).json({ success: false, message: 'Code not accepted. Check your authenticator and try again.' });
  }
  db.transaction(() => {
    db.prepare("UPDATE users SET mfa_secret = ?, mfa_enabled = 1, updated_at = datetime('now') WHERE id = ?").run(encryptSecret(secret), decoded.id);
    db.prepare('DELETE FROM mfa_challenges WHERE user_id = ? AND challenge_type = ?').run(decoded.id, 'setup');
  })();
  const user = cleanUserForSession(decoded.id);
  const backupCodes = backupCodesRemainingCount(user.id) === 0 ? saveBackupCodesForUser(user.id) : null;
  issueSession(res, user, req, { mfaVerified: true });
  logActivity(user.id, 'MFA_ENABLED', 'Multi-factor authentication enabled');
  return res.json({
    success: true,
    message: 'MFA is enabled and sign-in is complete.',
    data: { user, ...(backupCodes ? { backup_codes: backupCodes } : {}) },
  });
});

// Optional authenticator (TOTP) add-on + backup scratch codes for signed-in staff
router.post('/mfa/totp/setup', authenticate, authorize('admin'), mfaLimit, (req, res) => {
  const secret = generateTotpSecret();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  db.prepare("DELETE FROM mfa_challenges WHERE user_id = ? AND challenge_type = 'setup'").run(req.user.id);
  db.prepare("INSERT INTO mfa_challenges (id, user_id, challenge_type, secret_encrypted, expires_at) VALUES (?, ?, 'setup', ?, ?)")
    .run(crypto.randomBytes(24).toString('base64url'), req.user.id, encryptSecret(secret), expiresAt);
  const label = encodeURIComponent(`DLAS:${req.user.email}`);
  const issuer = encodeURIComponent('Digital Literacy Assessment System');
  return res.json({
    success: true,
    data: {
      secret,
      otpauth_url: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    },
  });
});

router.post('/mfa/totp/confirm', authenticate, authorize('admin'), mfaLimit, [
  body('code').isString().isLength({ min: 6, max: 8 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Enter the 6-digit code from your authenticator app.' });
  }
  const challenge = db.prepare(`
    SELECT id, user_id, secret_encrypted, attempts FROM mfa_challenges
    WHERE user_id = ? AND challenge_type = 'setup' AND datetime(expires_at) > datetime('now')
  `).get(req.user.id);
  if (!challenge || challenge.attempts >= 5) {
    return res.status(401).json({ success: false, message: 'Authenticator setup expired. Start setup again.' });
  }
  let secret;
  let isValid = false;
  try { secret = decryptSecret(challenge.secret_encrypted); isValid = verifyTotp(secret, req.body.code); } catch {}
  if (!isValid) {
    db.prepare('UPDATE mfa_challenges SET attempts = attempts + 1 WHERE id = ?').run(challenge.id);
    return res.status(401).json({ success: false, message: 'Code not accepted. Check your authenticator and try again.' });
  }
  const backupCodes = saveBackupCodesForUser(req.user.id);
  db.transaction(() => {
    db.prepare("UPDATE users SET mfa_secret = ?, mfa_enabled = 1, updated_at = datetime('now') WHERE id = ?").run(encryptSecret(secret), req.user.id);
    db.prepare('DELETE FROM mfa_challenges WHERE user_id = ? AND challenge_type = ?').run(req.user.id, 'setup');
    db.prepare('UPDATE auth_sessions SET mfa_verified = 1 WHERE id = ?').run(req.sessionId);
  })();
  logActivity(req.user.id, 'MFA_ENABLED', 'Optional authenticator app enabled with backup scratch codes');
  return res.json({
    success: true,
    message: 'Authenticator app enabled. Save your backup scratch codes in a safe place.',
    data: {
      mfa_enabled: 1,
      backup_codes: backupCodes,
      backup_codes_remaining: backupCodes.length,
    },
  });
});

router.delete('/mfa/totp', authenticate, authorize('admin'), [
  body('current_password').notEmpty().withMessage('Current password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Enter your current password to disable the authenticator app.' });
  }
  const row = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!row || !await bcrypt.compare(req.body.current_password, row.password)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }
  db.prepare("UPDATE users SET mfa_secret = NULL, mfa_enabled = 0, updated_at = datetime('now') WHERE id = ?").run(req.user.id);
  logActivity(req.user.id, 'MFA_TOTP_DISABLED', 'Authenticator app disabled; email OTP remains active');
  return res.json({
    success: true,
    message: 'Authenticator app removed. Email 6-digit verification remains active.',
    data: { mfa_enabled: 0 },
  });
});

router.post('/mfa/backup-codes/regenerate', authenticate, authorize('admin'), [
  body('current_password').notEmpty().withMessage('Current password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Enter your current password to generate new backup scratch codes.' });
  }
  const row = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);
  if (!row || !await bcrypt.compare(req.body.current_password, row.password)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }
  const backupCodes = saveBackupCodesForUser(req.user.id);
  logActivity(req.user.id, 'MFA_BACKUP_CODES_REGENERATED', 'Generated new single-use backup scratch codes');
  return res.json({
    success: true,
    message: 'New backup scratch codes generated. Previous unused codes are now invalid.',
    data: {
      backup_codes: backupCodes,
      backup_codes_remaining: backupCodes.length,
    },
  });
});

router.post('/logout', authenticate, (req, res) => {
  revokeSession(req.sessionId, req.user.id);
  clearSessionCookies(res);
  logActivity(req.user.id, 'LOGOUT', 'User signed out');
  return res.json({ success: true, message: 'Signed out successfully.' });
});

router.get('/sessions', authenticate, (req, res) => {
  const sessions = db.prepare(`
    SELECT id, user_agent, created_at, last_seen_at, expires_at, id = ? AS is_current
    FROM auth_sessions
    WHERE user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    ORDER BY is_current DESC, last_seen_at DESC
  `).all(req.sessionId, req.user.id);
  return res.json({ success: true, data: sessions });
});

router.delete('/sessions/:id', authenticate, (req, res) => {
  const session = db.prepare('SELECT id FROM auth_sessions WHERE id = ? AND user_id = ? AND revoked_at IS NULL').get(req.params.id, req.user.id);
  if (!session) return res.status(404).json({ success: false, message: 'Session not found or already signed out.' });
  revokeSession(session.id, req.user.id);
  if (session.id === req.sessionId) clearSessionCookies(res);
  logActivity(req.user.id, 'SESSION_REVOKED', 'User ended an active session');
  return res.json({ success: true, message: 'Session signed out.' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.email_verified, u.mfa_enabled, u.created_at, u.updated_at
    FROM users u WHERE u.id = ?
  `).get(req.user.id);

  let profile = null;
  if (user.role === 'respondent') {
    profile = db.prepare('SELECT * FROM respondent_profiles WHERE user_id = ?').get(user.id);
  }

  res.json({
    success: true,
    data: {
      ...user,
      mfa_required: isMfaRequired(req.user),
      backup_codes_remaining: ['admin'].includes(user.role) ? backupCodesRemainingCount(user.id) : 0,
      profile,
    },
  });
});

// Account-specific dashboard character preferences.
router.get('/me/dashboard-character', authenticate, authorize('respondent'), (req, res) => {
  const row = db.prepare('SELECT settings_json FROM dashboard_characters WHERE user_id = ?').get(req.user.id);
  let settings = characterDefaults;
  if (row) {
    try {
      settings = validateCharacterSettings(JSON.parse(row.settings_json)).settings || characterDefaults;
    } catch {
      settings = characterDefaults;
    }
  }
  return res.json({ success: true, data: { settings } });
});

router.put('/me/dashboard-character', authenticate, authorize('respondent'), (req, res) => {
  const { settings, error } = validateCharacterSettings(req.body?.settings);
  if (error) return res.status(400).json({ success: false, message: error });
  db.prepare(`
    INSERT INTO dashboard_characters (user_id, settings_json)
    VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = datetime('now')
  `).run(req.user.id, JSON.stringify(settings));
  logActivity(req.user.id, 'DASHBOARD_CHARACTER_UPDATE', 'User customized their dashboard character');
  return res.json({ success: true, message: 'Your dashboard character was saved.', data: { settings } });
});

// PUT /api/auth/me/profile-picture
// The picture is stored separately from demographic data so it is never included in reporting queries.
router.put('/me/profile-picture', authenticate, (req, res) => {
  const match = typeof req.body?.image === 'string'
    ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(req.body.image)
    : null;

  if (!match) {
    return res.status(400).json({ success: false, message: 'Choose a valid JPG, PNG, or WebP image.' });
  }

  const [, mimeType, base64Data] = match;
  if (base64Data.length > Math.ceil(MAX_PROFILE_PICTURE_BYTES / 3) * 4) {
    return res.status(413).json({ success: false, message: 'Profile pictures must be 700 KB or smaller after optimization.' });
  }

  const imageBuffer = Buffer.from(base64Data, 'base64');
  if (imageBuffer.length > MAX_PROFILE_PICTURE_BYTES) {
    return res.status(413).json({ success: false, message: 'Profile pictures must be 700 KB or smaller after optimization.' });
  }
  if (imageBuffer.toString('base64') !== base64Data || !matchesImageSignature(imageBuffer, mimeType)) {
    return res.status(400).json({ success: false, message: 'The selected file does not match a supported image format.' });
  }

  db.prepare(`
    INSERT INTO profile_pictures (user_id, mime_type, image_data)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      mime_type = excluded.mime_type,
      image_data = excluded.image_data,
      updated_at = datetime('now')
  `).run(req.user.id, mimeType, imageBuffer);

  logActivity(req.user.id, 'PROFILE_PICTURE_UPDATE', 'User added or replaced their profile picture');
  return res.json({ success: true, message: 'Profile picture updated successfully.' });
});

// GET /api/auth/me/profile-picture
// Images are served only to the authenticated account that owns them.
router.get('/me/profile-picture', authenticate, (req, res) => {
  const picture = db.prepare('SELECT mime_type, image_data FROM profile_pictures WHERE user_id = ?').get(req.user.id);
  if (!picture) {
    return res.status(404).json({ success: false, message: 'No profile picture has been added.' });
  }

  const imageBuffer = Buffer.from(picture.image_data);
  res.set({
    'Content-Type': picture.mime_type,
    'Content-Length': imageBuffer.length,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return res.send(imageBuffer);
});

// PUT /api/auth/me
router.put('/me', authenticate, [
  body('first_name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('First name must be at most 100 characters'),
  body('last_name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Last name must be at most 100 characters'),
  body('age').optional({ nullable: true }).isInt({ min: 1, max: 150 }).withMessage('Invalid age'),
  body('sex').optional({ nullable: true, checkFalsy: true }).isIn(['Male', 'Female', 'Prefer not to say', 'Other']).withMessage('Invalid sex'),
  ...['municipality', 'barangay', 'junior_high_school', 'junior_high_school_type', 'senior_high_school', 'senior_high_school_type', 'shs_strand', 'monthly_family_income', 'internet_access_type']
    .map((field) => body(field).optional({ nullable: true }).isString().isLength({ max: 200 }).trim()),
  ...['junior_high_school_type', 'senior_high_school_type']
    .map((field) => body(field).optional({ nullable: true, checkFalsy: true }).isIn(['Public', 'Private', 'Other'])),
  body('monthly_family_income_amount').optional({ nullable: true }).isInt({ min: 0, max: 100000000 }),
  body('has_computer_at_home').optional({ nullable: true, checkFalsy: true }).isIn([0, 1, '0', '1', true, false]),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { first_name, last_name } = req.body;

  const profileFields = {
    age: 'age', sex: 'sex', municipality: 'municipality', barangay: 'barangay',
    junior_high_school: 'junior_high_school', junior_high_school_type: 'junior_high_school_type',
    senior_high_school: 'senior_high_school', senior_high_school_type: 'senior_high_school_type',
    shs_strand: 'shs_strand', monthly_family_income: 'monthly_family_income',
    monthly_family_income_amount: 'monthly_family_income_amount',
    has_computer_at_home: 'has_computer_at_home', internet_access_type: 'internet_access_type',
  };
  const requestedProfileFields = Object.keys(profileFields).filter((field) => Object.hasOwn(req.body, field));
  let profileConsentVersion = null;
  if (req.user.role === 'respondent' && requestedProfileFields.length > 0) {
    const activeConsent = db.prepare(`
      SELECT ac.consent_version
      FROM assessment_consents ac
      LEFT JOIN respondent_profiles p ON p.user_id = ac.user_id
      WHERE ac.user_id = ? AND ac.status = 'consented' AND ac.participant_confirmed = 1
        AND (COALESCE(ac.participant_age, p.age, 0) >= 18 OR (ac.guardian_confirmed = 1 AND ac.guardian_email_verified = 1))
      ORDER BY datetime(ac.consented_at) DESC
      LIMIT 1
    `).get(req.user.id);
    if (!activeConsent) {
      return res.status(403).json({ success: false, message: 'Review and complete the approved consent process before saving research profile details.' });
    }
    profileConsentVersion = activeConsent.consent_version;
  }
  const updateProfile = db.transaction(() => {
    const userUpdates = [];
    const userParams = [];
    if (first_name !== undefined) { userUpdates.push('first_name = ?'); userParams.push(first_name); }
    if (last_name !== undefined) { userUpdates.push('last_name = ?'); userParams.push(last_name); }
    if (userUpdates.length) {
      userUpdates.push("updated_at = datetime('now')");
      db.prepare(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`).run(...userParams, req.user.id);
    }

    if (req.user.role === 'respondent') {
        const fields = Object.keys(profileFields).filter((field) => Object.hasOwn(req.body, field));
      if (fields.length) {
        const values = fields.map((field) => {
          const value = req.body[field];
          if (value === null || value === '') return null;
          if (field === 'has_computer_at_home') return Number(value === true ? 1 : value === false ? 0 : value);
          return typeof value === 'string' ? value.trim() : value;
        });
        if (Object.hasOwn(req.body, 'monthly_family_income_amount')) {
          const amountIndex = fields.indexOf('monthly_family_income_amount');
          const incomeAmount = req.body.monthly_family_income_amount === '' || req.body.monthly_family_income_amount === null
            ? null
            : Number(req.body.monthly_family_income_amount);
          values[amountIndex] = incomeAmount;
          const incomeCategory = incomeAmount === null
            ? null
            : incomeAmount < 10000
              ? 'below 10,000'
              : incomeAmount <= 30000
                ? '10,000-30,000'
                : 'above 30,000';
          const categoryIndex = fields.indexOf('monthly_family_income');
          if (categoryIndex >= 0) values[categoryIndex] = incomeCategory;
          else {
            fields.push('monthly_family_income');
            values.push(incomeCategory);
          }
        }
        const columns = fields.map((field) => profileFields[field]);
        db.prepare(`
          INSERT INTO respondent_profiles (user_id, ${columns.join(', ')})
          VALUES (?, ${columns.map(() => '?').join(', ')})
          ON CONFLICT(user_id) DO UPDATE SET ${columns.map((column) => `${column} = excluded.${column}`).join(', ')}
        `).run(req.user.id, ...values);
        if (profileConsentVersion) {
          db.prepare('UPDATE respondent_profiles SET profile_consent_version = ? WHERE user_id = ?')
            .run(profileConsentVersion, req.user.id);
        }
      }
    }
  });
  updateProfile();

  logActivity(req.user.id, 'PROFILE_UPDATE', 'User updated their profile');

  // Return updated user
  const updatedUser = db.prepare('SELECT id, email, first_name, last_name, role, status, created_at, updated_at FROM users WHERE id = ?').get(req.user.id);
  const profile = req.user.role === 'respondent'
    ? db.prepare('SELECT * FROM respondent_profiles WHERE user_id = ?').get(req.user.id)
    : null;

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { ...updatedUser, profile },
  });
});

// PUT /api/auth/me/password
router.put('/me/password', authenticate, [
  body('current_password').notEmpty().withMessage('Current password is required'),
  body('new_password').isLength({ min: 10, max: 128 }).withMessage('New password must be between 10 and 128 characters'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

  if (!await bcrypt.compare(current_password, user.password)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }

  const hashedPassword = await bcrypt.hash(new_password, 12);
  db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?").run(hashedPassword, req.user.id);
  revokeUserSessions(req.user.id, req.sessionId);

  logActivity(req.user.id, 'PASSWORD_CHANGE', 'User changed their password');

  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;
