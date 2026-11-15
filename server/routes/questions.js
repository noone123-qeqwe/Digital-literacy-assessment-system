const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, logActivity } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');

// GET /api/questions/areas - Get all competence areas
router.get('/areas', authenticate, authorize('admin', 'assessor'), (req, res) => {
  try {
    const areas = db.prepare(`
      SELECT ca.*, COUNT(q.id) as question_count
      FROM competence_areas ca
      LEFT JOIN questions q ON ca.id = q.competence_area_id AND q.is_active = 1 AND q.instrument_code = 'dlas-thesis-v1'
      GROUP BY ca.id
      ORDER BY ca.sort_order ASC
    `).all();

    res.json({ success: true, data: areas });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve competence areas' });
  }
});

// GET /api/questions - List all questions grouped or flat
router.get('/', authenticate, authorize('admin', 'assessor'), (req, res) => {
  try {
    const areaId = req.query.area_id;
    const isActiveOnly = req.query.active_only === 'true';
    const instrumentCode = req.query.instrument_code || 'dlas-thesis-v1';
    if (!['dlas-thesis-v1', 'digcompsat-2020'].includes(instrumentCode)) {
      return res.status(400).json({ success: false, message: 'Unknown assessment instrument.' });
    }

    let query = `
      SELECT q.*, ca.name as area_name, ca.code as area_code
      FROM questions q
      JOIN competence_areas ca ON q.competence_area_id = ca.id
    `;
    const conditions = ['q.instrument_code = ?'];
    const params = [instrumentCode];

    if (areaId) {
      conditions.push('q.competence_area_id = ?');
      params.push(areaId);
    }
    if (isActiveOnly) {
      conditions.push('q.is_active = 1');
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY ca.sort_order ASC, q.question_number ASC';

    const questions = db.prepare(query).all(...params);

    // Grouping option
    if (req.query.grouped === 'true') {
      const grouped = {};
      for (const q of questions) {
        if (!grouped[q.area_code]) {
          grouped[q.area_code] = {
            area_id: q.competence_area_id,
            area_name: q.area_name,
            area_code: q.area_code,
            questions: []
          };
        }
        grouped[q.area_code].questions.push(q);
      }
      return res.json({ success: true, data: Object.values(grouped) });
    }

    res.json({ success: true, data: questions });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to retrieve questions' });
  }
});

// POST /api/questions - Add question (Admin only)
router.post('/', authenticate, authorize('admin'), [
  body('competence_area_id').isInt().withMessage('Valid competence area ID is required'),
  body('question_number').isInt({ min: 1 }).withMessage('Question number must be positive integer'),
  body('question_text').trim().isLength({ min: 1, max: 1000 }).withMessage('Question text is required and must be at most 1000 characters'),
  body('is_active').optional().isIn([0, 1]),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { competence_area_id, question_number, question_text, is_active = 1 } = req.body;
  const instrumentCode = req.body.instrument_code || 'dlas-thesis-v1';
  if (instrumentCode !== 'dlas-thesis-v1') {
    return res.status(400).json({ success: false, message: 'Externally sourced instrument items are versioned and cannot be edited here.' });
  }

  const area = db.prepare('SELECT id FROM competence_areas WHERE id = ?').get(competence_area_id);
  if (!area) {
    return res.status(400).json({ success: false, message: 'Competence area does not exist' });
  }

  let result;
  try {
    result = db.prepare(`
      INSERT INTO questions (competence_area_id, question_number, question_text, instrument_code, is_active)
      VALUES (?, ?, ?, ?, ?)
    `).run(competence_area_id, question_number, question_text, instrumentCode, Number(is_active));
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, message: 'That question number is already used in this competence area' });
    }
    throw err;
  }

  logActivity(req.user.id, 'QUESTION_CREATE', `Created question #${question_number} in area ${competence_area_id}`);

  res.status(201).json({
    success: true,
    message: 'Question added successfully',
    data: { id: result.lastInsertRowid, competence_area_id, question_number, question_text, is_active }
  });
});

// PUT /api/questions/:id - Edit question (Admin only)
router.put('/:id', authenticate, authorize('admin'), [
  body('competence_area_id').optional().isInt(),
  body('question_number').optional().isInt({ min: 1 }),
  body('question_text').optional().trim().isLength({ min: 1, max: 1000 }),
  body('is_active').optional().isInt({ min: 0, max: 1 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { competence_area_id, question_number, question_text, is_active } = req.body;
  const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);

  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found' });
  }
  if (question.instrument_code !== 'dlas-thesis-v1') {
    return res.status(409).json({ success: false, message: 'DigCompSAT items are read-only so the published instrument wording and scoring stay intact.' });
  }

  const updates = [];
  const params = [];

  if (competence_area_id !== undefined) { updates.push('competence_area_id = ?'); params.push(competence_area_id); }
  if (question_number !== undefined) { updates.push('question_number = ?'); params.push(question_number); }
  if (question_text !== undefined) { updates.push('question_text = ?'); params.push(question_text); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active); }

  if (competence_area_id !== undefined && !db.prepare('SELECT 1 FROM competence_areas WHERE id = ?').get(competence_area_id)) {
    return res.status(400).json({ success: false, message: 'Competence area does not exist' });
  }

  const semanticChange = (competence_area_id !== undefined && Number(competence_area_id) !== question.competence_area_id)
    || (question_number !== undefined && Number(question_number) !== question.question_number)
    || (question_text !== undefined && question_text !== question.question_text);
  if (semanticChange) {
    const usedByAssessment = db.prepare('SELECT 1 FROM assessment_questions WHERE question_id = ? LIMIT 1').get(question.id);
    if (usedByAssessment) {
      return res.status(409).json({
        success: false,
        message: 'This question is part of a saved assessment version and cannot be edited. Deactivate it and create a replacement question for future assessments.',
      });
    }
  }

  if (updates.length > 0) {
    params.push(req.params.id);
    try {
      db.prepare(`UPDATE questions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ success: false, message: 'That question number is already used in this competence area' });
      }
      throw err;
    }
    logActivity(req.user.id, 'QUESTION_UPDATE', `Updated question ID ${req.params.id}`);
  }

  const updated = db.prepare(`
    SELECT q.*, ca.name as area_name, ca.code as area_code
    FROM questions q JOIN competence_areas ca ON q.competence_area_id = ca.id
    WHERE q.id = ?
  `).get(req.params.id);

  res.json({ success: true, message: 'Question updated successfully', data: updated });
});

// DELETE /api/questions/:id - Toggle active status or delete (Admin only)
router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const question = db.prepare('SELECT id, instrument_code, is_active FROM questions WHERE id = ?').get(req.params.id);
  if (!question) {
    return res.status(404).json({ success: false, message: 'Question not found' });
  }
  if (question.instrument_code !== 'dlas-thesis-v1') {
    return res.status(409).json({ success: false, message: 'DigCompSAT items are read-only so the full published bank remains intact.' });
  }

  // Keep questions that have been used in an assessment so old results remain valid.
  const usedCount = db.prepare('SELECT COUNT(*) as count FROM responses WHERE question_id = ?').get(req.params.id).count;
  const assignedCount = db.prepare('SELECT COUNT(*) AS count FROM assessment_questions WHERE question_id = ?').get(req.params.id).count;

  if (usedCount > 0 || assignedCount > 0) {
    // Soft deactivate
    const newStatus = question.is_active === 1 ? 0 : 1;
    db.prepare('UPDATE questions SET is_active = ? WHERE id = ?').run(newStatus, req.params.id);
    logActivity(req.user.id, 'QUESTION_TOGGLE', `Toggled question ${req.params.id} active status to ${newStatus}`);
    return res.json({
      success: true,
      message: `Question is referenced by assessment history; status set to ${newStatus ? 'active' : 'inactive'}`
    });
  }

  // Delete directly if not used
  db.prepare('DELETE FROM assessment_questions WHERE question_id = ?').run(req.params.id);
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  logActivity(req.user.id, 'QUESTION_DELETE', `Deleted question ID ${req.params.id}`);

  res.json({ success: true, message: 'Question deleted successfully' });
});

module.exports = router;

