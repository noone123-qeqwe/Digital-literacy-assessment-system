const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, query, validationResult } = require('express-validator');
const { db, logActivity } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { sendSecurityEmail, clientUrl } = require('../utils/email');
const { clearSessionCookies } = require('../utils/authSecurity');
const { canAccessAssessment } = require('../middleware/auth');

// GET /api/users - List users with search, role filter, pagination
router.get('/', authenticate, authorize('admin', 'assessor'), (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const role = req.query.role || null;
    const status = req.query.status || null;

    let whereClauses = [];
    let params = [];

    if (search) {
      whereClauses.push('(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ? OR u.institutional_id LIKE ?)');
      params.push(search, search, search, search);
    }
    if (role) {
      whereClauses.push('u.role = ?');
      params.push(role);
    }
    if (status) {
      if (!['active', 'inactive', 'suspended'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status filter' });
      }
      whereClauses.push('u.status = ?');
      params.push(status);
    }
    if (req.user.role === 'assessor') {
      whereClauses.push("u.role = 'respondent'");
    }

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM users u ${whereStr}`);
    const total = countStmt.get(...params).total;

    // Assessors need names and email addresses to assign students, but not
    // demographic or account-history fields from the respondent profile.
    const userColumns = req.user.role === 'assessor'
      ? 'u.id, u.email, u.first_name, u.last_name, u.role, u.status'
      : `u.id, u.email, u.first_name, u.last_name, u.institutional_id, u.role, u.status, u.created_at, u.updated_at,
         p.age, p.sex, p.municipality, p.senior_high_school, p.shs_strand,
         (SELECT COUNT(*) FROM assessment_attempts a WHERE a.user_id = u.id AND a.status = 'completed') as completed_assessments`;
    const profileJoin = req.user.role === 'assessor' ? '' : 'LEFT JOIN respondent_profiles p ON u.id = p.user_id';
    const listStmt = db.prepare(`
      SELECT ${userColumns}
      FROM users u
      ${profileJoin}
      ${whereStr}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `);

    const users = listStmt.all(...params, limit, offset);

    res.json({
      success: true,
      data: {
        users,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        }
      }
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve users' });
  }
});

// POST /api/users - Create user (Admin only)
router.post('/', authenticate, authorize('admin'), [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 10, max: 128 }).withMessage('Password must be between 10 and 128 characters'),
  body('first_name').trim().isLength({ min: 1, max: 100 }).withMessage('First name is required'),
  body('last_name').trim().isLength({ min: 1, max: 100 }).withMessage('Last name is required'),
  body('institutional_id').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 64 }).matches(/^[a-zA-Z0-9._/-]+$/),
  body('role').isIn(['admin', 'assessor', 'respondent']).withMessage('Invalid role'),
  body('status').optional().isIn(['active', 'inactive', 'suspended']),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { email, password, first_name, last_name, role, status = 'active' } = req.body;
  const institutionalId = String(req.body.institutional_id || '').trim().toUpperCase() || null;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already exists' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const createUser = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO users (email, password, first_name, last_name, role, status, email_verified, institutional_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).run(email, hashedPassword, first_name, last_name, role, status, institutionalId);
      if (role === 'respondent') {
        db.prepare('INSERT INTO respondent_profiles (user_id) VALUES (?)').run(result.lastInsertRowid);
      }
      logActivity(req.user.id, 'USER_CREATE', `Admin created ${role} account`);
      return result.lastInsertRowid;
    });
    const id = createUser();
    const verificationToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
    db.prepare(`INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at) VALUES (?, ?, 'email_verification', ?)`)
      .run(id, tokenHash, new Date(Date.now() + 24 * 60 * 60_000).toISOString());
    await sendSecurityEmail({
      to: email,
      subject: 'Verify your DLAS account',
      text: 'An administrator created a DLAS account for you. Verify your email address to activate it.',
      actionUrl: clientUrl(`/verify-email?token=${encodeURIComponent(verificationToken)}`),
    });
    return res.status(201).json({
      success: true,
      message: 'Account created. The user must verify their email before signing in.',
      data: { id, email, first_name, last_name, role, status, email_verified: 0 }
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.errcode === 2067) {
      if (institutionalId && db.prepare('SELECT id FROM users WHERE institutional_id = ?').get(institutionalId)) {
        return res.status(409).json({ success: false, message: 'Student ID is already in use.' });
      }
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    return next(err);
  }
});

// Import a roster by matching existing respondent accounts. This avoids creating
// accounts with unknown passwords or assigning an unverified address.
router.post('/import-roster', authenticate, authorize('admin', 'assessor'), [
  body('assessment_id').isInt({ min: 1 }),
  body('rows').isArray({ min: 1, max: 500 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Choose an assessment and upload at most 500 roster rows.', errors: errors.array() });
  const assessment = db.prepare('SELECT id, title FROM assessments WHERE id = ?').get(req.body.assessment_id);
  if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found.' });
  if (!canAccessAssessment(req.user, assessment.id)) return res.status(403).json({ success: false, message: 'You do not have access to this assessment.' });

  const seen = new Set();
  const results = req.body.rows.map((row, index) => {
    const email = String(row?.email || '').trim().toLowerCase();
    const institutionalId = String(row?.student_id || row?.institutional_id || '').trim().toUpperCase();
    if (!email && !institutionalId) return { row: index + 1, status: 'skipped', reason: 'Add an email address or student ID.' };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { row: index + 1, status: 'skipped', reason: 'Email address is invalid.' };
    const key = email ? `email:${email}` : `id:${institutionalId.toLowerCase()}`;
    if (seen.has(key)) return { row: index + 1, status: 'skipped', reason: 'This participant appears more than once in the file.' };
    seen.add(key);
    const byEmail = email ? db.prepare("SELECT id, role, status, email_verified FROM users WHERE email = ?").get(email) : null;
    const byStudentId = institutionalId ? db.prepare("SELECT id, role, status, email_verified FROM users WHERE institutional_id = ?").get(institutionalId) : null;
    if (byEmail && byStudentId && byEmail.id !== byStudentId.id) return { row: index + 1, status: 'skipped', reason: 'Email and student ID belong to different accounts.' };
    const user = byEmail || byStudentId;
    if (!user) return { row: index + 1, status: 'skipped', reason: 'No existing account matches this row.' };
    if (user.role !== 'respondent' || user.status !== 'active') return { row: index + 1, status: 'skipped', reason: 'Matched account is not an active student account.' };
    if (!user.email_verified) return { row: index + 1, status: 'skipped', reason: 'Student must verify their email before assignment.' };
    return { row: index + 1, status: 'ready', userId: user.id };
  });

  const ready = results.filter((item) => item.status === 'ready');
  const insert = db.prepare('INSERT OR IGNORE INTO assessment_assignments (assessment_id, user_id, assigned_by) VALUES (?, ?, ?)');
  let assignedCount = 0;
  db.transaction(() => {
    for (const item of ready) {
      const inserted = insert.run(assessment.id, item.userId, req.user.id);
      if (inserted.changes) { assignedCount += 1; item.status = 'assigned'; }
      else item.status = 'already assigned';
      delete item.userId;
    }
  })();
  const alreadyAssigned = ready.length - assignedCount;
  logActivity(req.user.id, 'ROSTER_IMPORT', `Roster import for assessment #${assessment.id}: ${assignedCount} new assignments, ${alreadyAssigned} already assigned, ${results.length - ready.length} skipped`);
  return res.json({ success: true, message: `Added ${assignedCount} assignments. ${alreadyAssigned} were already assigned.`, data: { assignedCount, alreadyAssigned, skippedCount: results.length - ready.length, results } });
});

// GET /api/users/:id - Get single user details
router.get('/:id', authenticate, authorize('admin'), (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, email, first_name, last_name, role, status, created_at, updated_at
      FROM users WHERE id = ?
    `).get(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const profile = db.prepare('SELECT * FROM respondent_profiles WHERE user_id = ?').get(user.id);
    const attempts = db.prepare(`
      SELECT a.id, a.assessment_id, asm.title as assessment_title, a.status, 
             a.started_at, a.completed_at, a.overall_mean, a.overall_level
      FROM assessment_attempts a
      JOIN assessments asm ON a.assessment_id = asm.id
      WHERE a.user_id = ?
      ORDER BY a.started_at DESC
    `).all(user.id);

    res.json({
      success: true,
      data: { ...user, profile, attempts }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/users/:id - Update user (Admin only)
router.put('/:id', authenticate, authorize('admin'), [
  body('email').optional().isEmail().normalizeEmail(),
  body('first_name').optional().trim().notEmpty(),
  body('last_name').optional().trim().notEmpty(),
  body('institutional_id').optional({ nullable: true }).trim().isLength({ max: 64 }).matches(/^[a-zA-Z0-9._/-]*$/),
  body('role').optional().isIn(['admin', 'assessor', 'respondent']),
  body('status').optional().isIn(['active', 'inactive', 'suspended']),
  body('password').optional().isLength({ min: 10, max: 128 }).withMessage('Password must be between 10 and 128 characters'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { email, first_name, last_name, role, status, password } = req.body;
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);

  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (targetUser.id === req.user.id && ((status && status !== 'active') || (role && role !== 'admin'))) {
    return res.status(400).json({ success: false, message: 'You cannot deactivate or demote your own administrator account' });
  }
  if (targetUser.role === 'admin' && ((role && role !== 'admin') || (status && status !== 'active'))) {
    const activeAdmins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'").get().count;
    if (activeAdmins <= 1) {
      return res.status(400).json({ success: false, message: 'At least one active administrator must remain' });
    }
  }

  const updates = [];
  const params = [];
  const emailChanged = Boolean(email && email !== targetUser.email);
  const securitySensitiveChange = emailChanged
    || Boolean(password)
    || Boolean(role && role !== targetUser.role)
    || Boolean(status && status !== targetUser.status);
  let verificationToken = null;

  if (emailChanged) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, targetUser.id);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    updates.push('email = ?');
    params.push(email);
    updates.push('email_verified = 0');
  }

  if (first_name) { updates.push('first_name = ?'); params.push(first_name); }
  if (last_name) { updates.push('last_name = ?'); params.push(last_name); }
  if (Object.hasOwn(req.body, 'institutional_id')) {
    const institutionalId = String(req.body.institutional_id || '').trim().toUpperCase() || null;
    const duplicateId = institutionalId && db.prepare('SELECT id FROM users WHERE institutional_id = ? AND id != ?').get(institutionalId, targetUser.id);
    if (duplicateId) return res.status(409).json({ success: false, message: 'Student ID is already in use.' });
    updates.push('institutional_id = ?'); params.push(institutionalId);
  }
  if (role) { updates.push('role = ?'); params.push(role); }
  if (status) { updates.push('status = ?'); params.push(status); }
  if (password) {
    updates.push('password = ?');
    params.push(await bcrypt.hash(password, 12));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    params.push(targetUser.id);
    db.transaction(() => {
      db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      if (securitySensitiveChange) {
        db.prepare("UPDATE auth_sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL").run(targetUser.id);
      }
      if (emailChanged) {
        verificationToken = crypto.randomBytes(32).toString('base64url');
        const tokenHash = crypto.createHash('sha256').update(verificationToken).digest('hex');
        db.prepare("UPDATE auth_tokens SET used_at = datetime('now') WHERE user_id = ? AND token_type = 'email_verification' AND used_at IS NULL").run(targetUser.id);
        db.prepare("INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at) VALUES (?, ?, 'email_verification', ?)")
          .run(targetUser.id, tokenHash, new Date(Date.now() + 24 * 60 * 60_000).toISOString());
      }
    })();
  }

  if (emailChanged) {
    await sendSecurityEmail({
      to: email,
      subject: 'Verify your updated DLAS email address',
      text: 'An administrator updated the email address on your DLAS account. Verify this address to sign in again.',
      actionUrl: clientUrl(`/verify-email?token=${encodeURIComponent(verificationToken)}`),
    });
  }
  if (securitySensitiveChange && targetUser.id === req.user.id) clearSessionCookies(res);

  logActivity(req.user.id, 'USER_UPDATE', `Admin updated user ID: ${targetUser.id}`);

  const updated = db.prepare('SELECT id, email, first_name, last_name, role, status, updated_at FROM users WHERE id = ?').get(targetUser.id);
  res.json({ success: true, message: emailChanged ? 'User updated. A verification link was sent to the new email address.' : 'User updated successfully', data: updated });
});

// DELETE /api/users/:id - Deactivate or Delete user (Admin only)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const userId = req.params.id;
  if (parseInt(userId) === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
  }

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // Soft delete / deactivate
  db.prepare("UPDATE users SET status = 'inactive', updated_at = datetime('now') WHERE id = ?").run(userId);
  logActivity(req.user.id, 'USER_DEACTIVATE', `Deactivated user: ${user.email} (ID: ${userId})`);

  res.json({ success: true, message: 'User deactivated successfully' });
});

// GET /api/users/:id/results - Assessment results for user
router.get('/:id/results', authenticate, (req, res) => {
  // Allow user to view their own, or admin/assessor
  const targetId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid user ID' });
  }
  if (req.user.role === 'respondent' && targetId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const assessorScope = req.user.role === 'assessor'
    ? `AND (asm.created_by = ? OR EXISTS (
        SELECT 1 FROM assessment_assignments scope_aa
        WHERE scope_aa.assessment_id = asm.id AND scope_aa.assigned_by = ?
      ))`
    : '';
  const params = req.user.role === 'assessor' ? [targetId, req.user.id, req.user.id] : [targetId];
  if (req.user.role === 'assessor' && !db.prepare(`
    SELECT 1 FROM assessment_attempts at JOIN assessments asm ON asm.id = at.assessment_id
    WHERE at.user_id = ? ${assessorScope} LIMIT 1
  `).get(...params)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const attempts = db.prepare(`
    SELECT a.id, a.assessment_id, asm.title as assessment_title, a.status,
           a.started_at, a.completed_at, a.overall_mean, a.overall_level
    FROM assessment_attempts a
    JOIN assessments asm ON a.assessment_id = asm.id
    WHERE a.user_id = ? AND a.status = 'completed' ${assessorScope}
    ORDER BY a.completed_at DESC
  `).all(...params);

  for (const attempt of attempts) {
    const areaResults = db.prepare(`
      SELECT ar.*, ca.name as area_name, ca.code as area_code
      FROM area_results ar
      JOIN competence_areas ca ON ar.competence_area_id = ca.id
      WHERE ar.attempt_id = ?
      ORDER BY ca.sort_order ASC
    `).all(attempt.id);
    attempt.areaResults = areaResults;
  }

  res.json({ success: true, data: attempts });
});

module.exports = router;

