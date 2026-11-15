const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { SESSION_COOKIE, readCookie, requireCsrf } = require('../utils/authSecurity');

function canAccessAssessment(user, assessmentId) {
  if (user.role === 'admin') return true;
  if (user.role === 'respondent') {
    return Boolean(db.prepare(
      'SELECT 1 FROM assessment_assignments WHERE assessment_id = ? AND user_id = ?'
    ).get(assessmentId, user.id));
  }
  if (user.role === 'assessor') {
    return Boolean(db.prepare(`
      SELECT 1 FROM assessments a
      WHERE a.id = ? AND (
        a.created_by = ? OR EXISTS (
          SELECT 1 FROM assessment_assignments aa
          WHERE aa.assessment_id = a.id AND aa.assigned_by = ?
        )
      )
    `).get(assessmentId, user.id, user.id));
  }
  return false;
}

function canAccessAttempt(user, attempt) {
  if (user.role === 'admin') return true;
  if (user.role === 'respondent') return attempt.user_id === user.id;
  return user.role === 'assessor' && canAccessAssessment(user, attempt.assessment_id);
}

function authenticate(req, res, next) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ success: false, message: 'Your session has expired. Please sign in again.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.jti) return res.status(401).json({ success: false, message: 'Session is no longer valid. Please sign in again.' });
    const session = db.prepare(`
      SELECT id FROM auth_sessions
      WHERE id = ? AND user_id = ? AND revoked_at IS NULL AND datetime(expires_at) > datetime('now')
    `).get(decoded.jti, decoded.id);
    if (!session) return res.status(401).json({ success: false, message: 'Session is no longer active. Please sign in again.' });
    const user = db.prepare('SELECT id, email, first_name, last_name, role, status, email_verified, mfa_enabled FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'Invalid token. User not found.' });
    if (user.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    }
    if (!user.email_verified) return res.status(403).json({ success: false, message: 'Verify your email address before signing in.' });
    if (['admin', 'assessor'].includes(user.role) && !user.mfa_enabled) {
      return res.status(403).json({ success: false, message: 'Multi-factor authentication setup is required for this account.' });
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

module.exports = { authenticate, authorize, canAccessAssessment, canAccessAttempt };
