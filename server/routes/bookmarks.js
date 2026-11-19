const express = require('express');
const { db } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
const kinds = {
  knowledge: { table: 'quiz_bookmarks', key: 'quiz_id', records: 'knowledge_quizzes' },
  research: { table: 'assessment_bookmarks', key: 'assessment_id', records: 'assessments' },
};

// Match the assessment lists: saving a link never grants access to its content.
function visibility(kind, user) {
  if (user.role === 'admin') return { sql: '1=1', params: [] };
  return kind === 'knowledge'
    ? { sql: `EXISTS(SELECT 1 FROM quiz_assignments aa WHERE aa.quiz_id=a.id AND aa.user_id=?) AND
      (a.status='published' OR EXISTS(SELECT 1 FROM quiz_attempts ip WHERE ip.quiz_id=a.id AND ip.user_id=? AND ip.status='in_progress'))`, params: [user.id, user.id] }
    : { sql: "a.status='active' AND EXISTS(SELECT 1 FROM assessment_assignments aa WHERE aa.assessment_id=a.id AND aa.user_id=?)", params: [user.id] };
}

router.get('/', (req, res) => {
  const data = {};
  for (const [kind, config] of Object.entries(kinds)) {
    const scope = visibility(kind, req.user);
    data[kind] = db.prepare(`SELECT b.${config.key} id FROM ${config.table} b JOIN ${config.records} a ON a.id=b.${config.key}
      WHERE b.user_id=? AND (${scope.sql}) ORDER BY b.created_at DESC,b.${config.key} DESC`).all(req.user.id, ...scope.params).map((row) => row.id);
  }
  res.json({ success: true, data });
});

router.route('/:kind/:id').all((req, res, next) => {
  if (!Object.hasOwn(kinds, req.params.kind) || !/^[1-9]\d*$/.test(req.params.id) || !Number.isSafeInteger(Number(req.params.id))) {
    return res.status(400).json({ success: false, message: 'Choose a valid assessment to bookmark.' });
  }
  next();
}).put((req, res) => {
  const config = kinds[req.params.kind], assessmentId = Number(req.params.id);
  const scope = visibility(req.params.kind, req.user);
  const permitted = db.prepare(`SELECT 1 FROM ${config.records} a WHERE a.id=? AND (${scope.sql})`).get(assessmentId, ...scope.params);
  if (!permitted) return res.status(404).json({ success: false, message: 'This assessment is no longer available to bookmark.' });
  db.prepare(`INSERT INTO ${config.table}(user_id,${config.key}) VALUES(?,?) ON CONFLICT DO NOTHING`).run(req.user.id, assessmentId);
  res.json({ success: true, data: { bookmarked: true }, message: 'Assessment bookmarked.' });
}).delete((req, res) => {
  const config = kinds[req.params.kind];
  // A user can remove their own stale bookmark even after access is withdrawn.
  db.prepare(`DELETE FROM ${config.table} WHERE user_id=? AND ${config.key}=?`).run(req.user.id, Number(req.params.id));
  res.json({ success: true, data: { bookmarked: false }, message: 'Bookmark removed.' });
});

module.exports = router;
