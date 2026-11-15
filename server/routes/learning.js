const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticate, authorize } = require('../middleware/auth');
const { db, logActivity } = require('../db/database');

const router = express.Router();

const moduleSelect = `
  SELECT m.id, m.competence_area_id, ca.code AS area_code, ca.name AS area_name,
         m.title, m.description, m.resource_url, m.estimated_minutes, m.is_published,
         m.created_at, m.updated_at, m.published_at,
         EXISTS(SELECT 1 FROM learning_module_completions c WHERE c.module_id = m.id AND c.user_id = ?) AS completed,
         (SELECT c.completed_at FROM learning_module_completions c WHERE c.module_id = m.id AND c.user_id = ?) AS completed_at
  FROM learning_modules m JOIN competence_areas ca ON ca.id = m.competence_area_id
`;

router.get('/areas', authenticate, authorize('admin'), (_req, res) => {
  const areas = db.prepare('SELECT id, code, name FROM competence_areas ORDER BY sort_order').all();
  res.json({ success: true, data: areas });
});

router.get('/modules', authenticate, (req, res) => {
  const admin = req.user.role === 'admin';
  const rows = db.prepare(`${moduleSelect} ${admin ? '' : 'WHERE m.is_published = 1'} ORDER BY ca.sort_order, m.title`)
    .all(req.user.id, req.user.id);
  return res.json({ success: true, data: rows });
});

router.post('/modules', authenticate, authorize('admin'), [
  body('competence_area_id').isInt({ min: 1 }),
  body('title').trim().isLength({ min: 3, max: 120 }),
  body('description').trim().isLength({ min: 10, max: 1000 }),
  body('resource_url').isURL({ protocols: ['https'], require_protocol: true, allow_underscores: true }).isLength({ max: 500 }),
  body('estimated_minutes').optional().isInt({ min: 1, max: 600 }),
  body('is_published').optional().isBoolean(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Check the learning resource fields.', errors: errors.array() });
  const area = db.prepare('SELECT id FROM competence_areas WHERE id = ?').get(req.body.competence_area_id);
  if (!area) return res.status(400).json({ success: false, message: 'Choose a valid competence area.' });
  const result = db.prepare(`INSERT INTO learning_modules
    (competence_area_id, title, description, resource_url, estimated_minutes, is_published, created_by, published_by, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN ? ELSE NULL END, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END)`)
    .run(req.body.competence_area_id, req.body.title.trim(), req.body.description.trim(), req.body.resource_url,
      Number(req.body.estimated_minutes || 15), req.body.is_published ? 1 : 0, req.user.id,
      req.body.is_published ? 1 : 0, req.user.id, req.body.is_published ? 1 : 0);
  logActivity(req.user.id, 'LEARNING_MODULE_CREATE', `Created learning resource #${result.lastInsertRowid}`);
  return res.status(201).json({ success: true, message: 'Learning resource added.', data: { id: result.lastInsertRowid } });
});

router.put('/modules/:id', authenticate, authorize('admin'), [
  body('competence_area_id').isInt({ min: 1 }),
  body('title').trim().isLength({ min: 3, max: 120 }),
  body('description').trim().isLength({ min: 10, max: 1000 }),
  body('resource_url').isURL({ protocols: ['https'], require_protocol: true, allow_underscores: true }).isLength({ max: 500 }),
  body('estimated_minutes').isInt({ min: 1, max: 600 }),
  body('is_published').isBoolean(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Check the learning resource fields.', errors: errors.array() });
  const area = db.prepare('SELECT id FROM competence_areas WHERE id = ?').get(req.body.competence_area_id);
  if (!area) return res.status(400).json({ success: false, message: 'Choose a valid competence area.' });
  const existing = db.prepare('SELECT * FROM learning_modules WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: 'Learning resource not found.' });
  const contentChanged = Number(existing.competence_area_id) !== Number(req.body.competence_area_id)
    || existing.title !== req.body.title.trim()
    || existing.description !== req.body.description.trim()
    || existing.resource_url !== req.body.resource_url
    || Number(existing.estimated_minutes) !== Number(req.body.estimated_minutes);
  const shouldPublish = Boolean(req.body.is_published) && !contentChanged;
  db.prepare(`UPDATE learning_modules SET competence_area_id = ?, title = ?, description = ?, resource_url = ?,
      estimated_minutes = ?, is_published = ?, published_by = ?, published_at = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(req.body.competence_area_id, req.body.title.trim(), req.body.description.trim(), req.body.resource_url,
      req.body.estimated_minutes, shouldPublish ? 1 : 0,
      shouldPublish ? (existing.is_published ? existing.published_by : req.user.id) : null,
      shouldPublish ? (existing.is_published ? existing.published_at : new Date().toISOString()) : null, req.params.id);
  logActivity(req.user.id, 'LEARNING_MODULE_UPDATE', `Updated learning resource #${req.params.id}`);
  return res.json({ success: true, message: contentChanged ? 'Changes saved as a draft. Review and publish the updated resource when it is approved.' : shouldPublish ? 'Learning resource updated.' : 'Learning resource unpublished.' });
});

router.delete('/modules/:id', authenticate, authorize('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM learning_modules WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ success: false, message: 'Learning resource not found.' });
  logActivity(req.user.id, 'LEARNING_MODULE_DELETE', `Deleted learning resource #${req.params.id}`);
  return res.json({ success: true, message: 'Learning resource deleted.' });
});

router.post('/modules/:id/complete', authenticate, authorize('respondent'), (req, res) => {
  const result = db.prepare(`INSERT INTO learning_module_completions (module_id, user_id)
    SELECT id, ? FROM learning_modules WHERE id = ? AND is_published = 1
    ON CONFLICT(module_id, user_id) DO NOTHING`).run(req.user.id, req.params.id);
  const moduleExists = db.prepare('SELECT id FROM learning_modules WHERE id = ? AND is_published = 1').get(req.params.id);
  if (!moduleExists) return res.status(404).json({ success: false, message: 'Learning resource not found.' });
  if (result.changes) logActivity(req.user.id, 'LEARNING_MODULE_COMPLETE', `Completed learning resource #${req.params.id}`);
  return res.json({ success: true, message: 'Progress saved.' });
});

router.delete('/modules/:id/complete', authenticate, authorize('respondent'), (req, res) => {
  db.prepare('DELETE FROM learning_module_completions WHERE module_id = ? AND user_id = ?').run(req.params.id, req.user.id);
  return res.json({ success: true, message: 'Completion status cleared.' });
});

module.exports = router;
