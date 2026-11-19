const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, logActivity, buildAssessmentSnapshot, SCORING_VERSION } = require('../db/database');
const { authenticate, authorize, canAccessAssessment } = require('../middleware/auth');
const { sendSecurityEmail, clientUrl, mailConfigurationReady } = require('../utils/email');
const { rateLimit } = require('../middleware/rateLimit');

const reminderLimit = rateLimit({ id: 'assessment-reminder', windowMs: 30 * 60 * 1000, max: 3, message: 'Reminder sends are limited. Please try again later.' });

// GET /api/assessments - List assessments (role-aware)
router.get('/', authenticate, (req, res) => {
  try {
    const user = req.user;
    let query = '';
    let params = [];

    if (user.role === 'admin') {
      query = `
        SELECT a.*, u.first_name || ' ' || u.last_name as creator_name,
               (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = a.id) as question_count,
               (SELECT COUNT(DISTINCT user_id) FROM assessment_assignments aa WHERE aa.assessment_id = a.id) as assigned_count,
               (SELECT COUNT(*) FROM assessment_attempts at WHERE at.assessment_id = a.id AND at.status = 'completed') as completed_count
        FROM assessments a
        LEFT JOIN users u ON a.created_by = u.id
        ORDER BY a.created_at DESC
      `;
    } else {
      // Respondent - only assigned assessments
      query = `
      SELECT a.id, a.title, a.description, a.status, a.time_limit_minutes, a.max_attempts, a.start_date, a.end_date, a.scoring_version,
               aa.assigned_at,
               (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = a.id) as question_count,
               at.id as attempt_id, at.status as attempt_status, at.overall_mean, at.overall_level, at.completed_at,
               (SELECT COUNT(*) FROM assessment_attempts all_attempts WHERE all_attempts.assessment_id = a.id AND all_attempts.user_id = ?) AS attempt_count
        FROM assessments a
        JOIN assessment_assignments aa ON a.id = aa.assessment_id
        LEFT JOIN assessment_attempts at ON at.id = (
          SELECT latest.id FROM assessment_attempts latest
          WHERE latest.assessment_id = a.id AND latest.user_id = ?
          ORDER BY latest.started_at DESC, latest.id DESC LIMIT 1
        )
        WHERE aa.user_id = ? AND a.status = 'active'
        ORDER BY aa.assigned_at DESC
      `;
      params = [user.id, user.id, user.id];
    }

    const assessments = db.prepare(query).all(...params);
    res.json({ success: true, data: assessments });
  } catch (err) {
    console.error('Error fetching assessments:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve assessments' });
  }
});

// POST /api/assessments - Create assessment (Admin only)
router.post('/', authenticate, authorize('admin'), [
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Assessment title is required and must be at most 200 characters'),
  body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }).trim(),
  body('time_limit_minutes').optional().isInt({ min: 1 }),
  body('max_attempts').optional().isInt({ min: 1, max: 10 }),
  body('question_ids').isArray({ min: 1 }).withMessage('At least one question must be selected'),
  body('question_ids.*').isInt({ min: 1 }),
  body('instrument_code').optional().isIn(['dlas-thesis-v1', 'digcompsat-2020']),
  body('assigned_user_ids').optional().isArray(),
  body('assigned_user_ids.*').optional().isInt({ min: 1 }),
  body('start_date').optional({ nullable: true }).isISO8601(),
  body('end_date').optional({ nullable: true }).isISO8601(),
  body('consent_required').optional().isBoolean(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { title, description, time_limit_minutes, start_date, end_date, question_ids, assigned_user_ids } = req.body;
  const instrumentCode = req.body.instrument_code || 'dlas-thesis-v1';
  const maxAttempts = Number(req.body.max_attempts || 1);
  const consentRequired = process.env.NODE_ENV === 'production'
    || req.body.consent_required === undefined
    || [true, 1, 'true', '1'].includes(req.body.consent_required);
  if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({ success: false, message: 'Assessment end date must be after its start date' });
  }

  const questionIds = [...new Set(question_ids.map(Number))];
  if (questionIds.length !== question_ids.length) {
    return res.status(400).json({ success: false, message: 'Question IDs must be unique' });
  }
  const validQuestions = db.prepare(`
    SELECT id FROM questions WHERE is_active = 1 AND instrument_code = ? AND id IN (${questionIds.map(() => '?').join(',')})
  `).all(instrumentCode, ...questionIds);
  if (validQuestions.length !== questionIds.length) {
    return res.status(400).json({ success: false, message: 'Every selected question must exist and be active' });
  }
  if (instrumentCode === 'digcompsat-2020') {
    const bankQuestionIds = db.prepare(`
      SELECT id FROM questions WHERE instrument_code = ? AND is_active = 1 ORDER BY question_number
    `).all(instrumentCode).map((question) => question.id);
    if (bankQuestionIds.length !== 82 || bankQuestionIds.some((id) => !questionIds.includes(id))) {
      return res.status(400).json({ success: false, message: 'The DigCompSAT assessment must include the complete 82-item published bank.' });
    }
  }
  const userIds = [...new Set((assigned_user_ids || []).map(Number))];
  if (userIds.length !== (assigned_user_ids || []).length) {
    return res.status(400).json({ success: false, message: 'Assigned user IDs must be unique' });
  }
  if (userIds.length) {
    const respondents = db.prepare(`
      SELECT id FROM users WHERE role = 'respondent' AND status = 'active'
      AND id IN (${userIds.map(() => '?').join(',')})
    `).all(...userIds);
    if (respondents.length !== userIds.length) {
      return res.status(400).json({ success: false, message: 'Assignments must reference active respondent accounts' });
    }
  }

  try {
    const createAssessment = db.transaction(() => {
    const instrumentSnapshot = buildAssessmentSnapshot(questionIds);
    if (!instrumentSnapshot) throw new Error('Unable to capture the assessment instrument version.');
    const insertAssessment = db.prepare(`
      INSERT INTO assessments (title, description, created_by, status, time_limit_minutes, max_attempts, consent_required, start_date, end_date, instrument_snapshot, scoring_version)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertAssessment.run(
      title,
      description || null,
      req.user.id,
      time_limit_minutes || null,
      maxAttempts,
      consentRequired ? 1 : 0,
      start_date || null,
      end_date || null,
      JSON.stringify(instrumentSnapshot),
      instrumentSnapshot.scoringVersion
    );

    const assessmentId = result.lastInsertRowid;

    // Attach questions
    const insertAQ = db.prepare('INSERT INTO assessment_questions (assessment_id, question_id) VALUES (?, ?)');
    for (const qId of questionIds) {
      insertAQ.run(assessmentId, qId);
    }

    // Assign to users if provided
    if (userIds.length > 0) {
      const insertAssign = db.prepare('INSERT INTO assessment_assignments (assessment_id, user_id, assigned_by) VALUES (?, ?, ?)');
      for (const uId of userIds) {
        insertAssign.run(assessmentId, uId, req.user.id);
      }
    }

    logActivity(req.user.id, 'ASSESSMENT_CREATE', `Created assessment: "${title}" (ID: ${assessmentId})`);
    return assessmentId;
    });
    const assessmentId = createAssessment();

    return res.status(201).json({
      success: true,
      message: 'Assessment created successfully',
      data: { id: assessmentId, title, question_count: questionIds.length }
    });
  } catch (err) {
    console.error('Error creating assessment:', err);
    res.status(500).json({ success: false, message: 'Failed to create assessment' });
  }
});

// GET /api/assessments/:id - Get assessment details with full questions
router.get('/:id', authenticate, (req, res) => {
  try {
    const assessmentId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
    }
    if (req.user.role !== 'admin' && !canAccessAssessment(req.user, assessmentId)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this assessment' });
    }
    const assessment = db.prepare(`
      SELECT a.*, u.first_name || ' ' || u.last_name as creator_name
      FROM assessments a
      LEFT JOIN users u ON a.created_by = u.id
      WHERE a.id = ?
    `).get(assessmentId);

    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }

    let instrumentSnapshot;
    try { instrumentSnapshot = assessment.instrument_snapshot ? JSON.parse(assessment.instrument_snapshot) : null; } catch { instrumentSnapshot = null; }
    if (!instrumentSnapshot?.items?.length) {
      const questionIds = db.prepare('SELECT question_id FROM assessment_questions WHERE assessment_id = ? ORDER BY id').all(assessmentId).map((row) => row.question_id);
      instrumentSnapshot = buildAssessmentSnapshot(questionIds);
      if (instrumentSnapshot) {
        assessment.instrument_snapshot = JSON.stringify(instrumentSnapshot);
        assessment.scoring_version = instrumentSnapshot.scoringVersion;
        db.prepare('UPDATE assessments SET instrument_snapshot = ?, scoring_version = ? WHERE id = ?').run(assessment.instrument_snapshot, assessment.scoring_version, assessmentId);
      }
    }
    const questions = instrumentSnapshot?.items || [];

    assessment.questions = questions;

    // If respondent, avoid exposing unreleased questions before the opening window or raw snapshots.
    if (req.user.role === 'respondent') {
      delete assessment.instrument_snapshot;
      const notOpenedYet = assessment.start_date && Date.parse(assessment.start_date) > Date.now();
      if (assessment.status !== 'active' || notOpenedYet) {
        assessment.questions = [];
      }
      const attempt = db.prepare(`
        SELECT * FROM assessment_attempts WHERE assessment_id = ? AND user_id = ?
        ORDER BY started_at DESC, id DESC LIMIT 1
      `).get(assessmentId, req.user.id);
      assessment.my_attempt = attempt || null;
    }

    res.json({ success: true, data: assessment });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/assessments/:id - Update assessment
router.put('/:id', authenticate, authorize('admin'), [
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('description').optional({ nullable: true }).isString().isLength({ max: 2000 }).trim(),
  body('time_limit_minutes').optional({ nullable: true }).isInt({ min: 1 }),
  body('max_attempts').optional().isInt({ min: 1, max: 10 }),
  body('status').optional().isIn(['active', 'inactive', 'archived']),
  body('start_date').optional({ nullable: true }).isISO8601(),
  body('end_date').optional({ nullable: true }).isISO8601(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { title, description, time_limit_minutes, max_attempts, status, start_date, end_date } = req.body;
  if (start_date && end_date && new Date(end_date) < new Date(start_date)) {
    return res.status(400).json({ success: false, message: 'Assessment end date must be after its start date' });
  }
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);

  if (!assessment) {
    return res.status(404).json({ success: false, message: 'Assessment not found' });
  }
  if (!canAccessAssessment(req.user, assessment.id)) {
    return res.status(403).json({ success: false, message: 'You do not have access to this assessment' });
  }

  if (time_limit_minutes !== undefined
    && (assessment.time_limit_minutes ?? null) !== (time_limit_minutes === null ? null : Number(time_limit_minutes))) {
    const activeAttempts = db.prepare(`
      SELECT COUNT(*) AS count FROM assessment_attempts
      WHERE assessment_id = ? AND status = 'in_progress'
    `).get(assessment.id).count;
    if (activeAttempts > 0) {
      return res.status(409).json({
        success: false,
        message: 'The time limit cannot be changed while participants have attempts in progress. Wait for them to finish or expire first.',
      });
    }
  }
  if (max_attempts !== undefined) {
    const existingAttemptCount = db.prepare('SELECT COUNT(*) AS count FROM assessment_attempts WHERE assessment_id = ? AND status = \'completed\'').get(assessment.id).count;
    if (Number(max_attempts) < existingAttemptCount) return res.status(409).json({ success: false, message: 'Attempt limit cannot be lower than the number of completed attempts already recorded.' });
  }

  const updates = [];
  const params = [];

  if (title) { updates.push('title = ?'); params.push(title); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (time_limit_minutes !== undefined) { updates.push('time_limit_minutes = ?'); params.push(time_limit_minutes); }
  if (max_attempts !== undefined) { updates.push('max_attempts = ?'); params.push(max_attempts); }
  if (status) { updates.push('status = ?'); params.push(status); }
  if (start_date !== undefined) { updates.push('start_date = ?'); params.push(start_date); }
  if (end_date !== undefined) { updates.push('end_date = ?'); params.push(end_date); }

  if (updates.length > 0) {
    params.push(req.params.id);
    db.prepare(`UPDATE assessments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    logActivity(req.user.id, 'ASSESSMENT_UPDATE', `Updated assessment ID: ${req.params.id}`);
  }

  const updated = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  res.json({ success: true, message: 'Assessment updated successfully', data: updated });
});

// DELETE /api/assessments/:id - Archive assessment
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) {
    return res.status(404).json({ success: false, message: 'Assessment not found' });
  }

  db.prepare("UPDATE assessments SET status = 'archived' WHERE id = ?").run(req.params.id);
  logActivity(req.user.id, 'ASSESSMENT_ARCHIVE', `Archived assessment ID: ${req.params.id}`);

  res.json({ success: true, message: 'Assessment archived successfully' });
});

// POST /api/assessments/:id/assign - Assign assessment to users
router.post('/:id/assign', authenticate, authorize('admin'), [
  body('user_ids').isArray({ min: 1 }).withMessage('Must provide user IDs to assign'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const assessmentId = req.params.id;
  const { user_ids } = req.body;

  const assessment = db.prepare('SELECT id, title FROM assessments WHERE id = ?').get(assessmentId);
  if (!assessment) {
    return res.status(404).json({ success: false, message: 'Assessment not found' });
  }
  if (!canAccessAssessment(req.user, assessmentId)) {
    return res.status(403).json({ success: false, message: 'You do not have access to this assessment' });
  }

  const userIds = [...new Set(user_ids.map(Number))];
  const validRespondents = db.prepare(`
    SELECT id FROM users WHERE role = 'respondent' AND status = 'active'
    AND id IN (${userIds.map(() => '?').join(',')})
  `).all(...userIds);
  if (validRespondents.length !== userIds.length || userIds.length !== user_ids.length) {
    return res.status(400).json({ success: false, message: 'Assignments must use unique active respondent IDs' });
  }

  const insertAssign = db.prepare(`
    INSERT OR IGNORE INTO assessment_assignments (assessment_id, user_id, assigned_by)
    VALUES (?, ?, ?)
  `);

  let assignedCount = 0;
  for (const uid of userIds) {
    const res = insertAssign.run(assessmentId, uid, req.user.id);
    if (res.changes > 0) assignedCount++;
  }

  logActivity(req.user.id, 'ASSESSMENT_ASSIGN', `Assigned assessment ${assessmentId} to ${assignedCount} users`);

  res.json({
    success: true,
    message: `Assessment successfully assigned to ${assignedCount} users`,
    assignedCount
  });
});

router.post('/:id/remind', authenticate, authorize('admin'), reminderLimit, async (req, res, next) => {
  if (!mailConfigurationReady()) return res.status(503).json({ success: false, message: 'Configure email delivery before sending reminders.' });
  const assessment = db.prepare('SELECT id, title, end_date FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found.' });
  if (!canAccessAssessment(req.user, assessment.id)) return res.status(403).json({ success: false, message: 'You do not have access to this assessment.' });
  const recipients = db.prepare(`
    SELECT DISTINCT u.id, u.email, u.first_name
    FROM assessment_assignments aa
    JOIN users u ON u.id = aa.user_id
    LEFT JOIN assessment_attempts at ON at.assessment_id = aa.assessment_id AND at.user_id = aa.user_id
    WHERE aa.assessment_id = ? AND u.role = 'respondent' AND u.status = 'active' AND u.email_verified = 1
      AND (at.id IS NULL OR at.status <> 'completed')
    ORDER BY u.id LIMIT 501
  `).all(assessment.id);
  if (recipients.length > 500) return res.status(413).json({ success: false, message: 'This assessment has more than 500 unfinished participants. Split the assignment into smaller cohorts before sending reminders.' });
  if (recipients.length === 0) return res.json({ success: true, message: 'Everyone assigned has completed this assessment.', data: { sent: 0, failed: 0 } });

  let sent = 0;
  let failed = 0;
  for (const recipient of recipients) {
    try {
      const deadline = assessment.end_date ? ` The assessment closes on ${assessment.end_date}.` : '';
      await sendSecurityEmail({
        to: recipient.email,
        subject: `Reminder: ${assessment.title}`,
        text: `Hello ${recipient.first_name}, you have an unfinished assessment: ${assessment.title}.${deadline} Sign in to continue or review your assigned assessments.`,
        actionUrl: clientUrl('/respondent/assessments'),
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error(`Assessment reminder failed for user #${recipient.id}:`, error.message);
    }
  }
  logActivity(req.user.id, 'ASSESSMENT_REMINDER', `Sent ${sent} reminders for assessment #${assessment.id}; ${failed} failed`);
  return res.json({ success: true, message: `Sent ${sent} reminder${sent === 1 ? '' : 's'}${failed ? `; ${failed} could not be delivered` : ''}.`, data: { sent, failed } });
});

// GET /api/assessments/:id/results - All results for assessment
router.get('/:id/results', authenticate, authorize('admin'), (req, res) => {
  try {
    const assessment = db.prepare('SELECT id, title, time_limit_minutes FROM assessments WHERE id = ?').get(req.params.id);
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    if (!canAccessAssessment(req.user, assessment.id)) {
      return res.status(403).json({ success: false, message: 'You do not have access to this assessment' });
    }

    const participants = db.prepare(`
      SELECT aa.user_id, u.first_name, u.last_name, u.email,
             at.id as attempt_id, at.status as attempt_status, at.started_at, at.completed_at,
             at.overall_mean, at.overall_level,
             (SELECT COUNT(*) FROM responses r WHERE r.attempt_id = at.id) AS answered_count
      FROM assessment_assignments aa
      JOIN users u ON aa.user_id = u.id
      LEFT JOIN assessment_attempts at ON at.id = (
        SELECT latest.id FROM assessment_attempts latest
        WHERE latest.assessment_id = aa.assessment_id AND latest.user_id = aa.user_id
        ORDER BY latest.started_at DESC, latest.id DESC LIMIT 1
      )
      WHERE aa.assessment_id = ?
      ORDER BY u.last_name ASC
    `).all(req.params.id);

    // Get area averages for this assessment
    const areaStats = db.prepare(`
      SELECT ca.id as area_id, ca.name as area_name, ca.code as area_code,
             ROUND(AVG(ar.weighted_mean), 2) as avg_mean,
             ROUND(AVG(ar.standard_deviation), 2) as avg_sd,
             COUNT(ar.id) as response_count
      FROM area_results ar
      JOIN competence_areas ca ON ar.competence_area_id = ca.id
      JOIN assessment_attempts at ON ar.attempt_id = at.id
      WHERE at.assessment_id = ? AND at.status = 'completed'
      GROUP BY ca.id
      ORDER BY ca.sort_order ASC
    `).all(req.params.id);

    res.json({
      success: true,
      data: {
        assessment,
        participants,
        areaStats
      }
    });
  } catch (err) {
    console.error('Error fetching assessment results:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve assessment results' });
  }
});

module.exports = router;

