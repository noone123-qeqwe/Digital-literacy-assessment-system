const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { SESSION_COOKIE, readCookie, requireCsrf } = require('../utils/authSecurity');
const { isMfaRequired } = require('../utils/mfaPolicy');

function canAccessAssessment(user, assessmentId) {
  if (user.role === 'admin') return true;
  if (user.role === 'respondent') {
    return Boolean(db.prepare(
      'SELECT 1 FROM assessment_assignments WHERE assessment_id = ? AND user_id = ?'
    ).get(assessmentId, user.id));
  }
  return false;
}

function canAccessAttempt(user, attempt) {
  if (user.role === 'admin') return true;
  if (user.role === 'respondent') return attempt.user_id === user.id;
  return false;
}

function authenticate(req, res, next) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.jti) return res.status(401).json({ success: false, message: 'Session is no longer valid. Please sign in again.' });
    const session = db.prepare(`
      SELECT id, mfa_verified FROM auth_sessions
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `).get(decoded.jti, decoded.id);
    if (!session) return res.status(401).json({ success: false, message: 'Session is no longer active. Please sign in again.' });
    const user = db.prepare(
      "SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.status, u.email_verified, u.mfa_enabled,"
      + " COALESCE(mfa_policy.setting_value, '0') AS mfa_optional FROM users u"
      + " LEFT JOIN system_settings mfa_policy ON mfa_policy.setting_key = 'mfa_optional_user:' || u.id"
      + ' WHERE u.id = ?'
    ).get(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'Invalid token. User not found.' });
    if (!['admin', 'respondent'].includes(user.role) || user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }
    if (!user.email_verified) return res.status(403).json({ success: false, message: 'Verify your email address before signing in.' });
    if (isMfaRequired(user) && !session.mfa_verified) {
      return res.status(403).json({ success: false, message: 'Multi-factor verification is required for this account.' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !requireCsrf(req, res)) return;
    req.user = user;
    req.sessionId = decoded.jti;
    db.prepare(`UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ? AND datetime(last_seen_at) < datetime('now', '-5 minutes')`).run(decoded.jti);
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

/**
 * Authorize specific roles
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied. Insufficient permissions.' });
    }
    next();
  };
}

// Password hashing yields control. Recheck the live session and permissions before a write.
function revalidateAuthentication(req, res, ...roles) {
  let allowed = false;
  authenticate(req, res, () => {
    if (roles.length) authorize(...roles)(req, res, () => { allowed = true; });
    else allowed = true;
  });
  return allowed;
}

module.exports = { authenticate, authorize, revalidateAuthentication, canAccessAssessment, canAccessAttempt };
