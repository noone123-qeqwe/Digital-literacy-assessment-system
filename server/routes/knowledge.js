const express = require('express');
const crypto = require('node:crypto');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { db, logActivity } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { questionInput, publicSnapshot, scoreSnapshot, shuffled, withOpaqueOptionIds, lockedReview } = require('../utils/knowledgeQuiz');
const { enrollPublishedQuizzes } = require('../utils/quizEnrollment');
const { programProgress } = require('../utils/programProgress');
const { nonblankAnswerSQL } = require('../db/quizCompletion');
const { drawCompletionAward } = require('../utils/completionAward');
const awardThemes = require('../../shared/completion-awards.json');

const router = express.Router();
router.use(authenticate);
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const id = (value) => {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw fail('Choose a valid record.');
  return Number(value);
};
const text = (value, min, max, label) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw fail(`${label} must contain ${min}–${max} characters.`);
  return value.trim();
};
const integer = (value, min, max, label) => {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw fail(`${label} must be between ${min} and ${max}.`);
  return result;
};
const handler = (fn) => (req, res, next) => {
  Promise.resolve().then(() => fn(req, res)).catch((error) => {
    if (error.status && error.status < 500 && !res.headersSent) return res.status(error.status).json({ success: false, message: error.message });
    return next(error);
  });
};
const result = (res, data, message, status = 200) => res.status(status).json({ success: true, data, message });
function quizFor(user, quizId) {
  const quiz = db.prepare('SELECT * FROM knowledge_quizzes WHERE id=?').get(id(quizId));
  if (!quiz) throw fail('Assessment not found.', 404);
  const permitted = user.role === 'admin'
    || (user.role === 'respondent' && db.prepare('SELECT 1 FROM quiz_assignments WHERE quiz_id=? AND user_id=?').get(quiz.id, user.id));
  if (!permitted) throw fail('You do not have access to this assessment.', 403);
  return quiz;
}
function attemptFor(user, attemptId) {
  const attempt = db.prepare(`SELECT a.*, u.first_name, u.last_name, q.created_by, q.max_attempts quiz_max_attempts, q.end_date quiz_end_date, q.status quiz_status
    FROM quiz_attempts a JOIN users u ON u.id=a.user_id JOIN knowledge_quizzes q ON q.id=a.quiz_id WHERE a.id=?`).get(id(attemptId));
  if (!attempt) throw fail('Attempt not found.', 404);
  if (!(user.role === 'admin' || (user.role === 'respondent' && attempt.user_id === user.id))) throw fail('You cannot access this student’s attempt.', 403);
  return attempt;
}
// Students only see accepted answers and explanations once they cannot use them to gain an advantage:
// every permitted attempt is used AND the assessment no longer accepts attempts from anyone (deadline
// passed, or staff unpublished/archived it). This blocks retaking with the key and sharing it with
// classmates or a second account that has not yet taken the assessment.
function answerKeyReleased(user, attempt) {
  if (user.role !== 'respondent') return true;
  if (attempt.status !== 'completed') return false;
  const used = db.prepare('SELECT COUNT(*) count FROM quiz_attempts WHERE quiz_id=? AND user_id=?').get(attempt.quiz_id, attempt.user_id).count;
  const closed = attempt.quiz_status !== 'published' || Boolean(attempt.quiz_end_date && Date.now() >= Date.parse(attempt.quiz_end_date));
  return used >= attempt.quiz_max_attempts && closed;
}
const integrityTypes = ['page_hidden', 'window_blur', 'copy_attempt', 'paste', 'context_menu'];
const maxIntegrityEvents = 400;
const integrityLimit = rateLimit({
  id: 'quiz-integrity',
  windowMs: 5 * 60 * 1000,
  max: 120,
  message: 'Too many integrity events recorded.',
  keyFn: (req) => (req.user?.id ? `user:${req.user.id}` : req.ip),
});
function integritySummary(attemptId) {
  const counts = Object.fromEntries([...integrityTypes, 'new_session'].map((type) => [type, 0]));
  for (const row of db.prepare("SELECT event_type,COUNT(*) count FROM quiz_integrity_events WHERE attempt_id=? AND event_type<>'attempt_started' GROUP BY event_type").all(attemptId)) counts[row.event_type] = row.count;
  return { ...counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
}
const sessionFingerprint = (sessionId) => crypto.createHash('sha256').update(String(sessionId || 'unknown')).digest('hex').slice(0, 24);
// Flags answers or submissions arriving from a sign-in session other than the one that began the attempt
// (for example, another person signing in to the same account on a second device).
function trackAttemptSession(attempt, sessionId) {
  const fingerprint = sessionFingerprint(sessionId);
  const known = db.prepare(`SELECT event_type FROM quiz_integrity_events WHERE attempt_id=? AND event_type IN ('attempt_started','new_session') AND detail=? LIMIT 1`).get(attempt.id, fingerprint);
  if (known) return;
  const hasBaseline = db.prepare("SELECT 1 FROM quiz_integrity_events WHERE attempt_id=? AND event_type='attempt_started' LIMIT 1").get(attempt.id);
  db.prepare('INSERT INTO quiz_integrity_events(attempt_id,event_type,detail,occurred_at) VALUES(?,?,?,?)')
    .run(attempt.id, hasBaseline ? 'new_session' : 'attempt_started', fingerprint, new Date().toISOString());
}
function attemptData(attempt, user) {
  const snapshot = JSON.parse(attempt.snapshot_json);
  const responses = db.prepare('SELECT question_id,answer FROM quiz_responses WHERE attempt_id=?').all(attempt.id);
  const { snapshot_json, quiz_max_attempts, quiz_end_date, quiz_status, ...safeAttempt } = attempt;
  const released = answerKeyReleased(user, attempt);
  const score = attempt.status === 'completed' ? scoreSnapshot(snapshot, responses) : null;
  return { attempt: safeAttempt, snapshot: publicSnapshot(snapshot), responses, server_now: new Date().toISOString(),
    expired: Boolean(attempt.deadline && Date.now() >= Date.parse(attempt.deadline)),
    answer_key_released: Boolean(score && released),
    integrity: user.role === 'respondent' ? undefined : integritySummary(attempt.id),
    results: score ? (released ? score : lockedReview(score)) : null };
}
function categoryExists(categoryId) {
  if (!db.prepare('SELECT id FROM quiz_categories WHERE id=?').get(categoryId)) throw fail('Choose an existing category.');
}
function reportRows(user) {
  const scope = user.role === 'admin' ? '1=1' : 'a.user_id=?';
  const integrityColumn = user.role === 'respondent' ? ''
    : ",(SELECT COUNT(*) FROM quiz_integrity_events ie WHERE ie.attempt_id=a.id AND ie.event_type<>'attempt_started') integrity_flags";
  return db.prepare(`SELECT a.id,a.quiz_id,a.user_id,a.percentage,a.level,a.certificate_earned,a.started_at,a.completed_at,
      a.earned_points,a.possible_points,a.completion_reason,u.first_name,u.last_name,q.title,q.program_code,q.stage,q.prerequisite_quiz_id,
      json_array_length(a.snapshot_json,'$.questions') question_count,
      (SELECT COUNT(*) FROM quiz_responses r WHERE r.attempt_id=a.id AND ${nonblankAnswerSQL}) answered_count${integrityColumn}
    FROM quiz_attempts a JOIN knowledge_quizzes q ON q.id=a.quiz_id JOIN users u ON u.id=a.user_id
    WHERE a.status='completed' AND ${scope} ORDER BY a.completed_at DESC,a.id DESC`).all(...(user.role === 'admin' ? [] : [user.id]));
}

router.get('/students', authorize('admin'), handler((req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '';
  const page = Math.max(1, Math.min(10000, Number.parseInt(req.query.page, 10) || 1));
  const pattern = `%${search}%`;
  const where = "role='respondent' AND status='active' AND email_verified=1 AND (first_name||' '||last_name LIKE ? OR email LIKE ?)";
  const total = db.prepare(`SELECT COUNT(*) count FROM users WHERE ${where}`).get(pattern, pattern).count;
  return result(res, { total, page, pages: Math.max(1, Math.ceil(total / 50)), users: db.prepare(`SELECT id,first_name,last_name,email FROM users WHERE ${where} ORDER BY last_name,id LIMIT 50 OFFSET ?`).all(pattern, pattern, (page - 1) * 50) });
}));
router.get('/research-results', handler((req, res) => {
  const scope = req.user.role === 'admin' ? '1=1' : req.user.role === 'respondent' ? 'a.user_id=?'
    : '(q.created_by=? OR EXISTS(SELECT 1 FROM assessment_assignments aa WHERE aa.assessment_id=q.id AND aa.assigned_by=?))';
  const params = req.user.role === 'admin' ? [] : req.user.role === 'respondent' ? [req.user.id] : [req.user.id, req.user.id];
  const rows = db.prepare(`SELECT a.id,a.user_id,a.overall_mean,a.overall_level,a.completed_at,a.scoring_version,
    q.title,u.first_name,u.last_name FROM assessment_attempts a JOIN assessments q ON q.id=a.assessment_id JOIN users u ON u.id=a.user_id
    WHERE a.status='completed' AND ${scope} ORDER BY a.completed_at DESC,a.id DESC LIMIT 500`).all(...params);
  return result(res, rows);
}));

function buildStudentCertificateItems(userId) {
  enrollPublishedQuizzes(db, userId);
  const student = db.prepare('SELECT id, first_name, last_name FROM users WHERE id=?').get(userId);
  const recipientName = `${student?.first_name || ''} ${student?.last_name || ''}`.trim();
  const now = Date.now();

  const quizzes = db.prepare(`SELECT q.id,q.title,q.description,q.status,q.pass_percentage,q.max_attempts,
      q.time_limit_minutes,q.start_date,q.end_date,q.program_code,q.stage,q.prerequisite_quiz_id,
      (SELECT title FROM knowledge_quizzes req WHERE req.id=q.prerequisite_quiz_id) prerequisite_title,
      EXISTS(SELECT 1 FROM quiz_attempts comp WHERE comp.quiz_id=q.prerequisite_quiz_id AND comp.user_id=? AND comp.status='completed'
        AND (SELECT COUNT(*) FROM quiz_responses r WHERE r.attempt_id=comp.id AND ${nonblankAnswerSQL})=json_array_length(comp.snapshot_json,'$.questions')) prerequisite_completed,
      (SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=?) attempt_count
    FROM knowledge_quizzes q
    JOIN quiz_assignments qa ON qa.quiz_id=q.id AND qa.user_id=?
    WHERE q.status='published' OR EXISTS(SELECT 1 FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=?)
    ORDER BY CASE WHEN q.stage='baseline' THEN 0 WHEN q.stage='follow_up' THEN 1 ELSE 2 END,q.id DESC`)
    .all(userId, userId, userId, userId);

  const quizAttempts = db.prepare(`SELECT id,quiz_id,status,percentage,level,certificate_earned,completion_reason,deadline,completed_at
    FROM quiz_attempts WHERE user_id=? ORDER BY id DESC`).all(userId);
  const attemptsByQuiz = new Map();
  for (const row of quizAttempts) {
    if (!attemptsByQuiz.has(row.quiz_id)) attemptsByQuiz.set(row.quiz_id, []);
    attemptsByQuiz.get(row.quiz_id).push(row);
  }

  const knowledgeItems = quizzes.map((q) => {
    const list = attemptsByQuiz.get(q.id) || [];
    const latest = list[0] || null;
    const qualifying = [...list]
      .filter((row) => row.status === 'completed' && row.certificate_earned === 1)
      .sort((a, b) => Number(b.percentage) - Number(a.percentage) || String(b.completed_at).localeCompare(String(a.completed_at)) || b.id - a.id)[0] || null;

    if (qualifying) {
      return {
        key: `knowledge:quiz:${q.id}`,
        instrument: 'knowledge',
        scoring_version: 'knowledge-achievement',
        certificate_title: 'Certificate of Achievement',
        assessment_id: q.id,
        assessment_title: q.title,
        assessment_description: q.description,
        stage: q.stage,
        unlocked: true,
        status: 'unlocked',
        completion_status: 'completed',
        completion_label: 'Completed',
        attempt_id: qualifying.id,
        recipient_name: recipientName,
        first_name: student?.first_name || '',
        last_name: student?.last_name || '',
        percentage: qualifying.percentage,
        level: qualifying.level,
        pass_percentage: q.pass_percentage,
        issued_at: qualifying.completed_at,
        reference_code: `MC-KQ-${String(qualifying.id).padStart(7, '0')}`,
        download_url: `/knowledge/attempts/${qualifying.id}/export/certificate`,
        result_path: `/respondent/knowledge/attempts/${qualifying.id}`,
        assessment_path: '/respondent/knowledge',
        time_expired: qualifying.completion_reason === 'time_expired',
        attempt_count: q.attempt_count,
        max_attempts: q.max_attempts,
      };
    }

    const latestExpired = Boolean(latest && (latest.completion_reason === 'time_expired'
      || (latest.status === 'in_progress' && latest.deadline && Date.parse(latest.deadline) <= now)));
    const completionStatus = latestExpired ? 'time_expired'
      : latest?.status === 'in_progress' ? 'in_progress'
      : latest?.status === 'completed' ? 'below_threshold'
      : 'not_started';
    const completionLabels = {
      time_expired: 'Time expired',
      in_progress: 'In progress',
      below_threshold: 'Passing score not met',
      not_started: 'Not started',
    };
    const prerequisiteLocked = Boolean(q.prerequisite_quiz_id && !q.prerequisite_completed && completionStatus !== 'in_progress');
    const closed = q.status !== 'published' || Boolean(q.end_date && Date.parse(q.end_date) <= now);
    const future = Boolean(q.start_date && Date.parse(q.start_date) > now);
    const exhausted = (Number(q.attempt_count || 0) >= Number(q.max_attempts || 1) || closed) && completionStatus !== 'in_progress';
    const lockedReason = completionStatus === 'below_threshold'
      ? `Complete the required assessment with at least ${q.pass_percentage}% to unlock this certificate (latest score: ${latest.percentage}%).`
      : completionStatus === 'time_expired'
      ? `Complete the required assessment to unlock this certificate. Your previous attempt timed out before reaching ${q.pass_percentage}%.`
      : prerequisiteLocked
      ? `Complete ${q.prerequisite_title || 'the prerequisite assessment'} first, then complete this assessment with at least ${q.pass_percentage}% to unlock this certificate.`
      : `Complete the required assessment to unlock this certificate.`;

    return {
      key: `knowledge:quiz:${q.id}`,
      instrument: 'knowledge',
      scoring_version: 'knowledge-achievement',
      certificate_title: 'Certificate of Achievement',
      assessment_id: q.id,
      assessment_title: q.title,
      assessment_description: q.description,
      stage: q.stage,
      unlocked: false,
      status: 'locked',
      completion_status: completionStatus,
      completion_label: completionLabels[completionStatus],
      locked_reason: lockedReason,
      prerequisite_locked: prerequisiteLocked,
      prerequisite_title: q.prerequisite_title || null,
      attempt_id: null,
      latest_percentage: latest?.status === 'completed' ? latest.percentage : null,
      latest_level: latest?.status === 'completed' ? latest.level : null,
      latest_result_path: latest?.status === 'completed' ? `/respondent/knowledge/attempts/${latest.id}` : null,
      pass_percentage: q.pass_percentage,
      start_date: q.start_date,
      end_date: q.end_date,
      exhausted,
      future,
      issued_at: null,
      reference_code: null,
      download_url: null,
      assessment_path: completionStatus === 'in_progress' && latest ? `/respondent/knowledge/attempts/${latest.id}` : '/respondent/knowledge',
      action_label: completionStatus === 'in_progress' ? 'Resume assessment' : 'Go to assessment',
      attempt_count: q.attempt_count,
      max_attempts: q.max_attempts,
    };
  });

  const researchAssessments = db.prepare(`SELECT a.id,a.title,a.description,a.status,a.scoring_version,a.start_date,a.end_date,a.max_attempts,
      (SELECT COUNT(*) FROM assessment_attempts aa2 WHERE aa2.assessment_id=a.id AND aa2.user_id=?) attempt_count
    FROM assessments a
    JOIN assessment_assignments aa ON aa.assessment_id=a.id AND aa.user_id=?
    WHERE a.status='active' OR EXISTS(SELECT 1 FROM assessment_attempts done WHERE done.assessment_id=a.id AND done.user_id=? AND done.status='completed')
    ORDER BY aa.assigned_at DESC,a.id DESC`).all(userId, userId, userId);

  const researchAttempts = db.prepare(`SELECT id,assessment_id,status,overall_mean,overall_level,scoring_version,completed_at
    FROM assessment_attempts WHERE user_id=? ORDER BY id DESC`).all(userId);
  const researchByAssessment = new Map();
  for (const row of researchAttempts) {
    if (!researchByAssessment.has(row.assessment_id)) researchByAssessment.set(row.assessment_id, []);
    researchByAssessment.get(row.assessment_id).push(row);
  }

  const researchItems = researchAssessments.map((a) => {
    const list = researchByAssessment.get(a.id) || [];
    const latest = list[0] || null;
    const qualifying = [...list]
      .filter((row) => row.status === 'completed' && row.completed_at)
      .sort((first, second) => String(second.completed_at).localeCompare(String(first.completed_at)) || second.id - first.id)[0] || null;
    const version = qualifying?.scoring_version || a.scoring_version || 'dlas-mean-1.0';
    const theme = awardThemes[version] || awardThemes.default;

    if (qualifying) {
      return {
        key: `research:assessment:${a.id}`,
        instrument: 'research',
        scoring_version: version,
        certificate_title: 'Certificate of Completion',
        assessment_id: a.id,
        assessment_title: a.title,
        assessment_description: a.description,
        unlocked: true,
        status: 'unlocked',
        completion_status: 'completed',
        completion_label: 'Completed',
        attempt_id: qualifying.id,
        recipient_name: recipientName,
        first_name: student?.first_name || '',
        last_name: student?.last_name || '',
        overall_mean: qualifying.overall_mean,
        overall_level: qualifying.overall_level,
        issued_at: qualifying.completed_at,
        reference_code: `${theme.referencePrefix}-${String(qualifying.id).padStart(7, '0')}`,
        download_url: `/export/awards/${qualifying.id}/pdf`,
        result_path: `/respondent/assessments/${qualifying.id}/results`,
        assessment_path: '/respondent/assessments',
        attempt_count: a.attempt_count,
        max_attempts: a.max_attempts,
      };
    }

    const completionStatus = latest?.status === 'in_progress' ? 'in_progress'
      : latest?.status === 'expired' ? 'time_expired'
      : 'not_started';
    const completionLabels = {
      in_progress: 'In progress',
      time_expired: 'Time expired',
      not_started: 'Not started',
    };
    const closed = Boolean(a.end_date && Date.parse(a.end_date) <= now);
    const future = Boolean(a.start_date && Date.parse(a.start_date) > now);
    return {
      key: `research:assessment:${a.id}`,
      instrument: 'research',
      scoring_version: version,
      certificate_title: 'Certificate of Completion',
      assessment_id: a.id,
      assessment_title: a.title,
      assessment_description: a.description,
      unlocked: false,
      status: 'locked',
      completion_status: completionStatus,
      completion_label: completionLabels[completionStatus],
      locked_reason: 'Complete the required assessment to unlock this certificate.',
      attempt_id: null,
      start_date: a.start_date,
      end_date: a.end_date,
      exhausted: completionStatus === 'time_expired' || closed,
      future,
      issued_at: null,
      reference_code: null,
      download_url: null,
      assessment_path: !closed && !future && completionStatus !== 'time_expired' ? `/respondent/assessments/${a.id}/take` : '/respondent/assessments',
      action_label: completionStatus === 'in_progress' ? 'Resume assessment' : 'Take assessment',
      attempt_count: a.attempt_count,
      max_attempts: a.max_attempts,
    };
  });

  const combined = [...knowledgeItems, ...researchItems];
  const unlockedItems = combined.filter((item) => item.unlocked)
    .sort((a, b) => String(b.issued_at).localeCompare(String(a.issued_at)));
  const lockedItems = combined.filter((item) => !item.unlocked);
  const items = [...unlockedItems, ...lockedItems];
  return {
    items,
    summary: { total: items.length, unlocked: unlockedItems.length, locked: lockedItems.length },
  };
}

function buildStaffCertificateItems(user) {
  const knowledgeEarned = reportRows(user)
    .filter((row) => row.certificate_earned)
    .map((row) => ({
      key: `knowledge:attempt:${row.id}`,
      instrument: 'knowledge',
      scoring_version: 'knowledge-achievement',
      certificate_title: 'Certificate of Achievement',
      assessment_id: row.quiz_id,
      assessment_title: row.title,
      unlocked: true,
      status: 'unlocked',
      completion_status: 'completed',
      completion_label: 'Completed',
      attempt_id: row.id,
      recipient_name: `${row.first_name} ${row.last_name}`.trim(),
      first_name: row.first_name,
      last_name: row.last_name,
      percentage: row.percentage,
      level: row.level,
      issued_at: row.completed_at,
      reference_code: `MC-KQ-${String(row.id).padStart(7, '0')}`,
      download_url: `/knowledge/attempts/${row.id}/export/certificate`,
      result_path: `/respondent/knowledge/attempts/${row.id}`,
      time_expired: row.completion_reason === 'time_expired',
    }));

  const scope = user.role === 'admin' ? '1=1'
    : '(q.created_by=? OR EXISTS(SELECT 1 FROM assessment_assignments aa WHERE aa.assessment_id=q.id AND aa.assigned_by=?))';
  const params = user.role === 'admin' ? [] : [user.id, user.id];
  const researchEarned = db.prepare(`SELECT a.id,a.assessment_id,a.user_id,a.overall_mean,a.overall_level,a.completed_at,a.scoring_version,
      q.title,u.first_name,u.last_name FROM assessment_attempts a JOIN assessments q ON q.id=a.assessment_id JOIN users u ON u.id=a.user_id
      WHERE a.status='completed' AND ${scope} ORDER BY a.completed_at DESC,a.id DESC LIMIT 500`).all(...params)
    .map((row) => {
      const version = row.scoring_version || 'dlas-mean-1.0';
      const theme = awardThemes[version] || awardThemes.default;
      return {
        key: `research:attempt:${row.id}`,
        instrument: 'research',
        scoring_version: version,
        certificate_title: 'Certificate of Completion',
        assessment_id: row.assessment_id,
        assessment_title: row.title,
        unlocked: true,
        status: 'unlocked',
        completion_status: 'completed',
        completion_label: 'Completed',
        attempt_id: row.id,
        recipient_name: `${row.first_name} ${row.last_name}`.trim(),
        first_name: row.first_name,
        last_name: row.last_name,
        overall_mean: row.overall_mean,
        overall_level: row.overall_level,
        issued_at: row.completed_at,
        reference_code: `${theme.referencePrefix}-${String(row.id).padStart(7, '0')}`,
        download_url: `/export/awards/${row.id}/pdf`,
        result_path: `/respondent/assessments/${row.id}/results`,
      };
    });

  const items = [...knowledgeEarned, ...researchEarned]
    .sort((a, b) => String(b.issued_at).localeCompare(String(a.issued_at)));
  return {
    items,
    summary: { total: items.length, unlocked: items.length, locked: 0 },
  };
}

router.get('/certificates', handler((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const payload = req.user.role === 'respondent'
    ? buildStudentCertificateItems(req.user.id)
    : buildStaffCertificateItems(req.user);
  return result(res, payload);
}));

router.get('/categories', handler((_req, res) => result(res, db.prepare(`SELECT c.*,
  (SELECT COUNT(*) FROM quiz_questions q WHERE q.category_id=c.id AND q.is_active=1) question_count,
  (SELECT COUNT(*) FROM quiz_materials m WHERE m.category_id=c.id) material_count
  FROM quiz_categories c ORDER BY c.id`).all())));
router.post('/categories', authorize('admin'), handler((req, res) => {
  const name = text(req.body.name, 3, 80, 'Category name');
  if (db.prepare('SELECT id FROM quiz_categories WHERE lower(name)=lower(?)').get(name)) throw fail('This category already exists.');
  const inserted = db.prepare('INSERT INTO quiz_categories(name,description) VALUES(?,?)').run(name, text(req.body.description || '', 0, 500, 'Description'));
  logActivity(req.user.id, 'QUIZ_CATEGORY_CREATE', `Created category #${inserted.lastInsertRowid}`);
  return result(res, { id: inserted.lastInsertRowid }, 'Category added.', 201);
}));
router.put('/categories/:id', authorize('admin'), handler((req, res) => {
  const categoryId = id(req.params.id); categoryExists(categoryId);
  const name = text(req.body.name, 3, 80, 'Category name');
  if (db.prepare('SELECT id FROM quiz_categories WHERE lower(name)=lower(?) AND id<>?').get(name, categoryId)) throw fail('This category already exists.');
  db.prepare('UPDATE quiz_categories SET name=?,description=? WHERE id=?').run(name, text(req.body.description || '', 0, 500, 'Description'), categoryId);
  logActivity(req.user.id, 'QUIZ_CATEGORY_UPDATE', `Updated category #${categoryId}`);
  return result(res, null, 'Category updated. Existing assessment snapshots keep their original labels.');
}));
router.delete('/categories/:id', authorize('admin'), handler((req, res) => {
  const categoryId = id(req.params.id); categoryExists(categoryId);
  if (db.prepare('SELECT 1 FROM quiz_questions WHERE category_id=? UNION SELECT 1 FROM quiz_materials WHERE category_id=?').get(categoryId, categoryId)) throw fail('Remove or move this category’s questions and learning materials first.', 409);
  db.prepare('DELETE FROM quiz_categories WHERE id=?').run(categoryId);
  logActivity(req.user.id, 'QUIZ_CATEGORY_DELETE', `Deleted category #${categoryId}`);
  return result(res, null, 'Category deleted.');
}));

router.get('/questions', authorize('admin'), handler((_req, res) => result(res,
  db.prepare(`SELECT q.*,c.name category_name FROM quiz_questions q JOIN quiz_categories c ON c.id=q.category_id WHERE q.is_active=1 ORDER BY q.id DESC`).all()
    .map(({ options_json, answers_json, ...question }) => ({ ...question, options: JSON.parse(options_json), answers: JSON.parse(answers_json) }))
)));
function saveQuestion(req, res, existingId = null) {
  let input;
  try { input = questionInput(req.body); } catch (error) { throw fail(error.message); }
  categoryExists(input.category_id);
  if (existingId) {
    if (!db.prepare('SELECT id FROM quiz_questions WHERE id=? AND is_active=1').get(existingId)) throw fail('Question not found.', 404);
    db.prepare('UPDATE quiz_questions SET category_id=?,prompt=?,type=?,options_json=?,answers_json=?,points=?,explanation=? WHERE id=?')
      .run(input.category_id, input.prompt, input.type, JSON.stringify(input.options), JSON.stringify(input.answers), input.points, input.explanation, existingId);
  } else {
    existingId = db.prepare('INSERT INTO quiz_questions(category_id,prompt,type,options_json,answers_json,points,explanation,created_by) VALUES(?,?,?,?,?,?,?,?)')
      .run(input.category_id, input.prompt, input.type, JSON.stringify(input.options), JSON.stringify(input.answers), input.points, input.explanation, req.user.id).lastInsertRowid;
  }
  logActivity(req.user.id, 'QUIZ_QUESTION_SAVE', `Saved question #${existingId}`);
  return result(res, { id: existingId }, 'Question saved. Existing assessments retain their saved version.');
}
router.post('/questions', authorize('admin'), handler((req, res) => saveQuestion(req, res)));
router.put('/questions/:id', authorize('admin'), handler((req, res) => saveQuestion(req, res, id(req.params.id))));
router.delete('/questions/:id', authorize('admin'), handler((req, res) => {
  const update = db.prepare('UPDATE quiz_questions SET is_active=0 WHERE id=? AND is_active=1').run(id(req.params.id));
  if (!update.changes) throw fail('Question not found.', 404);
  logActivity(req.user.id, 'QUIZ_QUESTION_ARCHIVE', `Archived question #${req.params.id}`);
  return result(res, null, 'Question removed from the bank. Saved assessments are preserved.');
}));

router.get('/quizzes', handler((req, res) => {
  if (req.user.role === 'respondent') enrollPublishedQuizzes(db, req.user.id);
  const scope = req.user.role === 'admin' ? '1=1' : `EXISTS(SELECT 1 FROM quiz_assignments aa WHERE aa.quiz_id=q.id AND aa.user_id=?) AND (q.status='published' OR EXISTS(SELECT 1 FROM quiz_attempts ip WHERE ip.quiz_id=q.id AND ip.user_id=${Number(req.user.id)} AND ip.status='in_progress'))`;
  const rows = db.prepare(`SELECT q.id,q.title,q.description,q.instructions,q.status,q.time_limit_minutes,q.max_attempts,q.pass_percentage,q.start_date,q.end_date,q.created_at,
    q.program_code,q.stage,q.prerequisite_quiz_id,q.auto_assign_verified,
    (SELECT title FROM knowledge_quizzes required WHERE required.id=q.prerequisite_quiz_id) prerequisite_title,
    EXISTS(SELECT 1 FROM quiz_attempts completed WHERE completed.quiz_id=q.prerequisite_quiz_id AND completed.user_id=? AND completed.status='completed'
      AND (SELECT COUNT(*) FROM quiz_responses r WHERE r.attempt_id=completed.id AND ${nonblankAnswerSQL})=json_array_length(completed.snapshot_json,'$.questions')) prerequisite_completed,
    json_array_length(q.snapshot_json,'$.questions') question_count,
    (SELECT COUNT(*) FROM quiz_assignments aa WHERE aa.quiz_id=q.id) assigned_count,
    (SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.status='completed' AND a.completion_reason='submitted') completed_count,
    (SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=?) attempt_count,
    (SELECT a.id FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=? ORDER BY a.id DESC LIMIT 1) latest_attempt_id,
    (SELECT a.status FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=? ORDER BY a.id DESC LIMIT 1) latest_status,
    (SELECT a.deadline FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=? ORDER BY a.id DESC LIMIT 1) latest_deadline,
    (SELECT a.completion_reason FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=? ORDER BY a.id DESC LIMIT 1) latest_completion_reason,
    (SELECT COUNT(*) FROM quiz_responses r WHERE r.attempt_id=(SELECT a.id FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=? ORDER BY a.id DESC LIMIT 1) AND ${nonblankAnswerSQL}) latest_answered_count
    FROM knowledge_quizzes q WHERE ${scope} ORDER BY CASE WHEN q.stage='baseline' THEN 0 WHEN q.stage='follow_up' THEN 1 ELSE 2 END,q.id DESC`).all(req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, req.user.id, ...(req.user.role === 'admin' ? [] : [req.user.id]));
  return result(res, rows);
}));
router.get('/quizzes/:id', handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  const { snapshot_json, ...safe } = quiz;
  return result(res, { ...safe, snapshot: req.user.role === 'respondent' ? undefined : JSON.parse(snapshot_json),
    assigned_user_ids: req.user.role === 'respondent' ? undefined : db.prepare('SELECT user_id FROM quiz_assignments WHERE quiz_id=?').all(quiz.id).map((row) => row.user_id) });
}));
router.post('/quizzes', authorize('admin'), handler((req, res) => {
  const body = req.body;
  const title = text(body.title, 3, 160, 'Title');
  const description = text(body.description || '', 0, 2000, 'Description');
  const instructions = text(body.instructions || 'Answer independently. Review your responses before submission.', 0, 3000, 'Instructions');
  if (!Array.isArray(body.question_ids) || !body.question_ids.length || body.question_ids.length > 200) throw fail('Choose 1–200 questions.');
  const ids = [...new Set(body.question_ids.map(id))];
  if (ids.length !== body.question_ids.length) throw fail('Question selections must be unique.');
  const questions = ids.map((questionId) => {
    const question = db.prepare('SELECT q.*,c.name category_name FROM quiz_questions q JOIN quiz_categories c ON c.id=q.category_id WHERE q.id=? AND q.is_active=1').get(questionId);
    if (!question) throw fail('Every selected question must be active.');
    return { id: question.id, category_id: question.category_id, category_name: question.category_name, prompt: question.prompt,
      type: question.type, options: JSON.parse(question.options_json), answers: JSON.parse(question.answers_json), points: question.points, explanation: question.explanation };
  });
  const maxAttempts = integer(body.max_attempts ?? 1, 1, 10, 'Attempts');
  const pass = integer(body.pass_percentage ?? 70, 1, 100, 'Certificate threshold');
  const minutes = body.time_limit_minutes ? integer(body.time_limit_minutes, 1, 180, 'Time limit') : null;
  if (body.randomize !== undefined && typeof body.randomize !== 'boolean') throw fail('Choose a valid randomization setting.');
  const dates = ['start_date', 'end_date'].map((key) => {
    if (!body[key]) return null;
    if (typeof body[key] !== 'string' || !Number.isFinite(Date.parse(body[key]))) throw fail('Choose a valid schedule.');
    return new Date(body[key]).toISOString();
  });
  if (dates[0] && dates[1] && dates[1] <= dates[0]) throw fail('The deadline must follow the opening date.');
  const status = body.status || 'draft';
  if (!['draft', 'published'].includes(status)) throw fail('Choose Draft or Published.');
  if (body.assign_all !== undefined && typeof body.assign_all !== 'boolean') throw fail('Choose a valid assignment option.');
  if (!body.assign_all && (!Array.isArray(body.assigned_user_ids) || body.assigned_user_ids.length > 5000)) throw fail('Choose students or assign to all active students.');
  const userIds = body.assign_all ? db.prepare("SELECT id FROM users WHERE role='respondent' AND status='active' AND email_verified=1").all().map((user) => user.id)
    : [...new Set(body.assigned_user_ids.map(id))];
  for (const userId of userIds) if (!db.prepare("SELECT id FROM users WHERE id=? AND role='respondent' AND status='active' AND email_verified=1").get(userId)) throw fail('Assign only active, verified student accounts.');
  const snapshot = { version: 'knowledge-quiz-v1', title, instructions, pass_percentage: pass, questions };
  const quizId = db.transaction(() => {
    const inserted = db.prepare(`INSERT INTO knowledge_quizzes(title,description,instructions,created_by,status,time_limit_minutes,max_attempts,pass_percentage,randomize,start_date,end_date,snapshot_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(title, description, instructions, req.user.id, status, minutes, maxAttempts, pass, body.randomize === false ? 0 : 1, ...dates, JSON.stringify(snapshot));
    for (const userId of userIds) db.prepare('INSERT INTO quiz_assignments(quiz_id,user_id,assigned_by) VALUES(?,?,?)').run(inserted.lastInsertRowid, userId, req.user.id);
    return inserted.lastInsertRowid;
  })();
  logActivity(req.user.id, 'KNOWLEDGE_ASSESSMENT_CREATE', `Created knowledge assessment #${quizId}`);
  return result(res, { id: quizId }, 'Assessment created with an immutable question and scoring snapshot.', 201);
}));
router.put('/quizzes/:id/status', authorize('admin'), handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  if (!['draft', 'published', 'archived'].includes(req.body.status)) throw fail('Choose a valid publication status.');
  db.prepare('UPDATE knowledge_quizzes SET status=? WHERE id=?').run(req.body.status, quiz.id);
  if (req.body.status === 'published') enrollPublishedQuizzes(db, null, quiz.id);
  logActivity(req.user.id, 'KNOWLEDGE_ASSESSMENT_STATUS', `Assessment #${quiz.id}: ${req.body.status}`);
  return result(res, null, 'Publication status updated. In-progress students retain their saved attempt.');
}));
router.post('/quizzes/:id/assign', authorize('admin'), handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  if (!Array.isArray(req.body.user_ids) || req.body.user_ids.length > 5000) throw fail('Choose a valid student list.');
  const ids = [...new Set(req.body.user_ids.map(id))];
  for (const userId of ids) if (!db.prepare("SELECT 1 FROM users WHERE id=? AND role='respondent' AND status='active' AND email_verified=1").get(userId)) throw fail('Choose active, verified students.');
  db.transaction(() => { for (const userId of ids) db.prepare('INSERT INTO quiz_assignments(quiz_id,user_id,assigned_by) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(quiz.id, userId, req.user.id); })();
  logActivity(req.user.id, 'KNOWLEDGE_ASSIGN', `Assigned ${ids.length} students to #${quiz.id}`);
  return result(res, null, 'Students assigned.');
}));
router.delete('/quizzes/:id', authorize('admin'), handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  if (db.prepare('SELECT id FROM quiz_attempts WHERE quiz_id=?').get(quiz.id)) throw fail('This assessment has attempts. Archive it to preserve student results.', 409);
  if (db.prepare('SELECT id FROM knowledge_quizzes WHERE prerequisite_quiz_id=?').get(quiz.id)) throw fail('Another assessment requires this baseline. Archive it instead of deleting it.', 409);
  db.prepare('DELETE FROM knowledge_quizzes WHERE id=?').run(quiz.id);
  logActivity(req.user.id, 'KNOWLEDGE_ASSESSMENT_DELETE', `Deleted unattempted assessment #${quiz.id}`);
  return result(res, null, 'Assessment deleted.');
}));

router.post('/quizzes/:id/start', authorize('respondent'), handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  const existing = db.prepare("SELECT id FROM quiz_attempts WHERE quiz_id=? AND user_id=? AND status='in_progress'").get(quiz.id, req.user.id);
  if (existing) {
    const ongoing = attemptFor(req.user, existing.id);
    trackAttemptSession(ongoing, req.sessionId);
    return result(res, attemptData(ongoing, req.user));
  }
  if (quiz.status !== 'published') throw fail('This assessment is not accepting new attempts.', 409);
  const now = Date.now();
  if (quiz.start_date && Date.parse(quiz.start_date) > now) throw fail('This assessment has not opened yet.', 409);
  if (quiz.end_date && Date.parse(quiz.end_date) <= now) throw fail('The assessment deadline has passed.', 410);
  if (quiz.prerequisite_quiz_id && !db.prepare(`SELECT 1 FROM quiz_attempts a WHERE quiz_id=? AND user_id=? AND status='completed'
    AND (SELECT COUNT(*) FROM quiz_responses r WHERE r.attempt_id=a.id AND ${nonblankAnswerSQL})=json_array_length(a.snapshot_json,'$.questions')`).get(quiz.prerequisite_quiz_id, req.user.id)) throw fail('Finish every question in your baseline assessment before starting the follow-up. An incomplete timed-out attempt does not unlock it; no minimum score is required.', 409);
  if (req.body.accepted_instructions !== true) throw fail('Confirm the instructions and independent-work statement before beginning.');
  const snapshot = JSON.parse(quiz.snapshot_json);
  if (quiz.randomize) snapshot.questions = shuffled(snapshot.questions).map((question) => ({ ...question, options: question.type === 'multiple_choice' ? shuffled(question.options) : question.options }));
  snapshot.questions = snapshot.questions.map(withOpaqueOptionIds);
  const limits = [quiz.time_limit_minutes ? now + quiz.time_limit_minutes * 60000 : null, quiz.end_date ? Date.parse(quiz.end_date) : null].filter((value) => value !== null);
  const startedAt = new Date(now).toISOString();
  const attemptOutcome = db.transaction(() => {
    const resume = db.prepare("SELECT id FROM quiz_attempts WHERE quiz_id=? AND user_id=? AND status='in_progress'").get(quiz.id, req.user.id);
    if (resume) return { id: resume.id, resumed: true };
    if (db.prepare('SELECT COUNT(*) count FROM quiz_attempts WHERE quiz_id=? AND user_id=?').get(quiz.id, req.user.id).count >= quiz.max_attempts) throw fail('You have used all permitted attempts.', 409);
    const createdId = db.prepare('INSERT INTO quiz_attempts(quiz_id,user_id,snapshot_json,deadline,started_at,integrity_confirmed_at) VALUES(?,?,?,?,?,?)')
      .run(quiz.id, req.user.id, JSON.stringify(snapshot), limits.length ? new Date(Math.min(...limits)).toISOString() : null, startedAt, startedAt).lastInsertRowid;
    trackAttemptSession({ id: createdId }, req.sessionId);
    logActivity(req.user.id, 'KNOWLEDGE_ATTEMPT_START', `Started knowledge attempt #${createdId}`);
    return { id: createdId, resumed: false };
  })();
  const attemptRecord = attemptFor(req.user, attemptOutcome.id);
  if (attemptOutcome.resumed) {
    trackAttemptSession(attemptRecord, req.sessionId);
    return result(res, attemptData(attemptRecord, req.user));
  }
  return result(res, attemptData(attemptRecord, req.user), 'Assessment started.');
}));
router.get('/attempts/:id', handler((req, res) => {
  const attempt = attemptFor(req.user, req.params.id);
  if (req.user.role === 'respondent' && attempt.status === 'in_progress') trackAttemptSession(attempt, req.sessionId);
  return result(res, attemptData(attempt, req.user));
}));
router.post('/attempts/:id/integrity', authorize('respondent'), integrityLimit, handler((req, res) => {
  const attempt = attemptFor(req.user, req.params.id);
  if (attempt.status !== 'in_progress' || (attempt.deadline && Date.now() >= Date.parse(attempt.deadline))) {
    return result(res, { recorded: false });
  }
  trackAttemptSession(attempt, req.sessionId);
  const eventType = typeof req.body?.event_type === 'string' ? req.body.event_type.trim() : '';
  if (!integrityTypes.includes(eventType)) throw fail('Unsupported integrity event type.');
  const detail = typeof req.body?.detail === 'string' ? req.body.detail.replace(/[\r\n]+/g, ' ').trim().slice(0, 100) : '';
  const recorded = db.transaction(() => {
    const total = db.prepare("SELECT COUNT(*) count FROM quiz_integrity_events WHERE attempt_id=? AND event_type<>'attempt_started'").get(attempt.id).count;
    if (total >= maxIntegrityEvents) return false;
    db.prepare('INSERT INTO quiz_integrity_events(attempt_id,event_type,detail,occurred_at) VALUES(?,?,?,?)')
      .run(attempt.id, eventType, detail, new Date().toISOString());
    return true;
  })();
  return result(res, { recorded });
}));
router.put('/attempts/:id/answers', authorize('respondent'), handler((req, res) => {
  const attempt = attemptFor(req.user, req.params.id);
  if (attempt.status !== 'in_progress') throw fail('Completed answers cannot be changed.', 409);
  if (attempt.deadline && Date.now() >= Date.parse(attempt.deadline)) throw fail('Time has ended. Only answers received before the deadline can be scored.', 410);
  trackAttemptSession(attempt, req.sessionId);
  const questions = new Map(JSON.parse(attempt.snapshot_json).questions.map((question) => [question.id, question]));
  if (!Number.isSafeInteger(req.body.expected_revision) || req.body.expected_revision < 0) throw fail('Reload the assessment before saving answers.');
  if (!Array.isArray(req.body.responses) || req.body.responses.length > questions.size) throw fail('Provide a valid answer batch.');
  const answers = req.body.responses.map((response) => {
    const question = questions.get(id(response.question_id));
    if (!question || typeof response.answer !== 'string' || response.answer.length > 500) throw fail('Choose a valid question and answer.');
    if (question.type !== 'identification' && response.answer !== '' && !question.options.some((option) => option.id === response.answer)) throw fail('Choose an answer from the supplied options.');
    return [question.id, response.answer];
  });
  if (new Set(answers.map(([questionId]) => questionId)).size !== answers.length) throw fail('Duplicate answers are not permitted in one batch.');
  db.transaction(() => {
    const update = db.prepare("UPDATE quiz_attempts SET answers_revision=answers_revision+1 WHERE id=? AND answers_revision=? AND status='in_progress'").run(attempt.id, req.body.expected_revision);
    if (!update.changes) throw fail('Answers changed in another tab or device. Review the saved answers before replacing them.', 409);
    const save = db.prepare('INSERT INTO quiz_responses(attempt_id,question_id,answer,saved_at) VALUES(?,?,?,?) ON CONFLICT(attempt_id,question_id) DO UPDATE SET answer=excluded.answer,saved_at=excluded.saved_at');
    for (const [questionId, answer] of answers) save.run(attempt.id, questionId, answer, new Date().toISOString());
  })();
  return result(res, { answers_revision: req.body.expected_revision + 1 }, 'Answers saved.');
}));
router.post('/attempts/:id/submit', authorize('respondent'), handler((req, res) => {
  const attempt = attemptFor(req.user, req.params.id);
  if (attempt.status === 'completed') return result(res, attemptData(attempt, req.user));
  trackAttemptSession(attempt, req.sessionId);
  const responses = db.prepare('SELECT question_id,answer FROM quiz_responses WHERE attempt_id=?').all(attempt.id);
  const snapshot = JSON.parse(attempt.snapshot_json);
  const expired = attempt.deadline && Date.now() >= Date.parse(attempt.deadline);
  if (!expired && (responses.filter((response) => response.answer.trim()).length !== snapshot.questions.length)) throw fail('Answer every question before submitting.');
  const score = scoreSnapshot(snapshot, responses);
  const completionReason = expired ? 'time_expired' : 'submitted';
  db.transaction(() => {
    const update = db.prepare("UPDATE quiz_attempts SET status='completed',completion_reason=?,completed_at=?,earned_points=?,possible_points=?,percentage=?,level=?,certificate_earned=? WHERE id=? AND status='in_progress'")
      .run(completionReason, new Date().toISOString(), score.earned, score.possible, score.percentage, score.level, score.certificateEarned ? 1 : 0, attempt.id);
    if (!update.changes) return;
    for (const category of score.categories) db.prepare('INSERT INTO quiz_category_results(attempt_id,category_id,category_name,earned,possible,percentage) VALUES(?,?,?,?,?,?)')
      .run(attempt.id, category.id, category.name, category.earned, category.possible, category.percentage);
    logActivity(req.user.id, expired ? 'KNOWLEDGE_ATTEMPT_TIMEOUT' : 'KNOWLEDGE_ATTEMPT_COMPLETE',
      `${expired ? 'Time expired for' : 'Submitted'} knowledge assessment #${attempt.quiz_id}`);
  })();
  return result(res, attemptData(attemptFor(req.user, attempt.id), req.user), 'Assessment scored.');
}));

router.get('/overview', handler((req, res) => {
  const allRows = reportRows(req.user);
  const latest = new Map(), histories = new Map();
  for (const row of allRows) {
    const key = `${row.user_id}:${row.quiz_id}`;
    if (!latest.has(key)) latest.set(key, row);
    if (!histories.has(key)) histories.set(key, []);
    histories.get(key).push(row);
  }
  const rows = [...latest.values()];
  const scope = req.user.role === 'admin' ? '1=1' : 'aa.user_id=?';
  const params = req.user.role === 'admin' ? [] : [req.user.id];
  const pendingAssignments = db.prepare(`SELECT COUNT(*) count FROM quiz_assignments aa JOIN knowledge_quizzes q ON q.id=aa.quiz_id
    WHERE ${scope} AND (q.status='published' OR EXISTS(SELECT 1 FROM quiz_attempts ip WHERE ip.quiz_id=q.id AND ip.user_id=aa.user_id AND ip.status='in_progress'))
    AND NOT EXISTS(SELECT 1 FROM quiz_attempts done WHERE done.quiz_id=q.id AND done.user_id=aa.user_id AND done.status='completed')
    AND NOT EXISTS(SELECT 1 FROM quiz_attempts ended WHERE ended.quiz_id=q.id AND ended.user_id=aa.user_id AND ended.status='in_progress' AND julianday(ended.deadline)<=julianday('now'))`).get(...params).count;
  const assignedQuizCount = db.prepare(`SELECT COUNT(DISTINCT aa.quiz_id) count FROM quiz_assignments aa JOIN knowledge_quizzes q ON q.id=aa.quiz_id
    WHERE ${scope} AND (q.status='published' OR EXISTS(SELECT 1 FROM quiz_attempts old WHERE old.quiz_id=q.id AND old.user_id=aa.user_id))`).get(...params).count;
  const scoreScope = req.user.role === 'admin' ? '1=1' : 'a.user_id=?';
  const expiredCount = db.prepare(`SELECT COUNT(*) count FROM quiz_attempts a JOIN knowledge_quizzes q ON q.id=a.quiz_id
    WHERE ${scoreScope} AND (a.completion_reason='time_expired' OR (a.status='in_progress' AND julianday(a.deadline)<=julianday('now')))
    AND NOT EXISTS(SELECT 1 FROM quiz_attempts newer WHERE newer.user_id=a.user_id AND newer.quiz_id=a.quiz_id AND newer.id>a.id)`).get(...params).count;
  const categoryScores = db.prepare(`SELECT cr.category_id id,COALESCE(c.name,MAX(cr.category_name)) name,SUM(cr.earned) earned,SUM(cr.possible) possible
    FROM quiz_category_results cr JOIN quiz_attempts a ON a.id=cr.attempt_id JOIN knowledge_quizzes q ON q.id=a.quiz_id LEFT JOIN quiz_categories c ON c.id=cr.category_id
    WHERE ${scoreScope} AND NOT EXISTS(SELECT 1 FROM quiz_attempts newer WHERE newer.user_id=a.user_id AND newer.quiz_id=a.quiz_id AND newer.status='completed'
      AND (newer.completed_at>a.completed_at OR (newer.completed_at=a.completed_at AND newer.id>a.id))) GROUP BY cr.category_id,c.name`).all(...params);
  const comparisons = rows.map((row) => {
    const history = histories.get(`${row.user_id}:${row.quiz_id}`);
    const first = history[history.length - 1];
    return { user_id: row.user_id, name: `${row.first_name} ${row.last_name}`, quiz_id: row.quiz_id, title: row.title, program_code: row.program_code,
      first: first.percentage, latest: row.percentage, change: Math.round((row.percentage - first.percentage) * 100) / 100, attempts: history.length };
  });
  const programCategoryRows = db.prepare(`SELECT cr.attempt_id,cr.category_id,cr.category_name,cr.percentage
    FROM quiz_category_results cr JOIN quiz_attempts a ON a.id=cr.attempt_id JOIN knowledge_quizzes q ON q.id=a.quiz_id
    WHERE a.status='completed' AND q.program_code IS NOT NULL AND ${scoreScope}`).all(...params);
  const programComparisons = programProgress(allRows.filter(row => row.answered_count === row.question_count), programCategoryRows);
  const average = rows.length ? rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length : null;
  const activities = req.user.role === 'admin' ? db.prepare(`SELECT l.action,l.details,l.created_at,u.first_name,u.last_name FROM activity_log l JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 8`).all()
    : db.prepare('SELECT action,details,created_at FROM activity_log WHERE user_id=? ORDER BY id DESC LIMIT 8').all(req.user.id);
  return result(res, {
    summary: { registeredStudents: req.user.role === 'admin' ? db.prepare("SELECT COUNT(*) count FROM users WHERE role='respondent'").get().count : 1,
      totalAssessments: req.user.role === 'admin' ? db.prepare("SELECT COUNT(*) count FROM knowledge_quizzes WHERE status<>'archived'").get().count
        : assignedQuizCount,
      completed: rows.filter(row => row.completion_reason !== 'time_expired').length,
      expired: expiredCount,
      pending: pendingAssignments, average: average === null ? null : Math.round(average * 100) / 100,
      highest: rows.length ? Math.max(...rows.map((row) => row.percentage)) : null, lowest: rows.length ? Math.min(...rows.map((row) => row.percentage)) : null,
      certificates: allRows.filter((row) => row.certificate_earned).length },
    distribution: ['Advanced', 'Proficient', 'Developing', 'Beginner', 'Needs Improvement'].map((level) => ({ level, count: rows.filter((row) => row.level === level).length })),
    categories: categoryScores.map((category) => ({ ...category, percentage: Math.round(category.earned / category.possible * 10000) / 100 })),
    history: allRows.slice(0, 500), totalHistory: allRows.length,
    comparisons: comparisons.slice(0, 500), programComparisons: programComparisons.slice(0, 500), activities,
  });
}));

router.get('/materials', handler((req, res) => result(res, db.prepare(`SELECT m.*,c.name category_name,
  EXISTS(SELECT 1 FROM quiz_material_completions mc WHERE mc.material_id=m.id AND mc.user_id=?) completed
  FROM quiz_materials m JOIN quiz_categories c ON c.id=m.category_id ${req.user.role === 'admin' ? '' : 'WHERE m.is_published=1'} ORDER BY c.id,m.id`).all(req.user.id))));
function validateHttpsUrl(raw, label) {
  let parsed;
  try { parsed = new URL(raw); } catch { throw fail(`Enter a complete HTTPS ${label.toLowerCase()}.`); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw fail(`${label} must use HTTPS without credentials.`);
  return parsed.toString();
}
function saveMaterial(req, res, materialId = null) {
  const categoryId = id(req.body.category_id); categoryExists(categoryId);
  const title = text(req.body.title, 3, 160, 'Title');
  const content = text(req.body.content, 20, 20000, 'Learning guide');
  const url = text(req.body.resource_url || '', 0, 500, 'Resource link');
  if (url) validateHttpsUrl(url, 'Resource link');
  const imageUrl = text(req.body.image_url || '', 0, 500, 'Image URL');
  if (imageUrl && !/^\/learning\/images\/[a-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(imageUrl)) {
    throw fail('Choose an approved diagram from the built-in image library.');
  }
  const imageCaption = text(req.body.image_caption || '', 0, 240, 'Image caption');
  const videoUrl = text(req.body.video_url || '', 0, 500, 'Video URL');
  if (videoUrl && !/^\/learning\/videos\/[a-z0-9_-]+\.(?:mp4|webm)$/i.test(videoUrl)) {
    validateHttpsUrl(videoUrl, 'Video URL');
  }
  const videoTitle = text(req.body.video_title || '', 0, 160, 'Video title');
  if (typeof req.body.is_published !== 'boolean') throw fail('Choose a publication setting.');
  if (materialId) {
    if (!db.prepare('SELECT id FROM quiz_materials WHERE id=?').get(materialId)) throw fail('Learning guide not found.', 404);
    db.transaction(() => {
      db.prepare('UPDATE quiz_materials SET category_id=?,title=?,content=?,resource_url=?,image_url=?,image_caption=?,video_url=?,video_title=?,is_published=? WHERE id=?')
        .run(categoryId, title, content, url, imageUrl, imageCaption, videoUrl, videoTitle, req.body.is_published ? 1 : 0, materialId);
      db.prepare('DELETE FROM quiz_material_completions WHERE material_id=?').run(materialId);
    })();
  } else {
    materialId = db.prepare('INSERT INTO quiz_materials(category_id,title,content,resource_url,image_url,image_caption,video_url,video_title,is_published) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(categoryId, title, content, url, imageUrl, imageCaption, videoUrl, videoTitle, req.body.is_published ? 1 : 0).lastInsertRowid;
  }
  logActivity(req.user.id, 'KNOWLEDGE_MATERIAL_SAVE', `Saved learning guide #${materialId}`);
  return result(res, { id: materialId }, 'Learning guide saved. Updated guides require completion again.');
}
router.post('/materials', authorize('admin'), handler((req, res) => saveMaterial(req, res)));
router.put('/materials/:id', authorize('admin'), handler((req, res) => saveMaterial(req, res, id(req.params.id))));
router.delete('/materials/:id', authorize('admin'), handler((req, res) => {
  if (!db.prepare('DELETE FROM quiz_materials WHERE id=?').run(id(req.params.id)).changes) throw fail('Learning guide not found.', 404);
  logActivity(req.user.id, 'KNOWLEDGE_MATERIAL_DELETE', `Deleted learning guide #${req.params.id}`);
  return result(res, null, 'Learning guide deleted.');
}));
router.put('/materials/:id/completion', authorize('respondent'), handler((req, res) => {
  const materialId = id(req.params.id);
  if (!db.prepare('SELECT id FROM quiz_materials WHERE id=? AND is_published=1').get(materialId)) throw fail('Learning guide not found.', 404);
  if (typeof req.body.completed !== 'boolean') throw fail('Choose a valid completion setting.');
    if (req.body.completed) db.prepare('INSERT INTO quiz_material_completions(material_id,user_id,completed_at) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(materialId, req.user.id, new Date().toISOString());
  else db.prepare('DELETE FROM quiz_material_completions WHERE material_id=? AND user_id=?').run(materialId, req.user.id);
  return result(res, null, 'Learning progress saved.');
}));

const safeCell = (value) => typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value;
router.get('/reports/:format', authorize('admin'), handler(async (req, res) => {
  const rows = reportRows(req.user);
  if (!['pdf', 'excel'].includes(req.params.format)) throw fail('Choose PDF or Excel.');
  if (req.params.format === 'excel') {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Knowledge results');
    sheet.addRow(['Student', 'Assessment', 'Score (%)', 'Level', 'Date finalized', 'Outcome', 'Answered', 'Achievement certificate']);
    for (const row of rows) sheet.addRow([safeCell(`${row.first_name} ${row.last_name}`), safeCell(row.title), row.percentage, row.level, row.completed_at,
      row.completion_reason === 'time_expired' ? 'Time expired' : 'Submitted', `${row.answered_count}/${row.question_count}`, row.certificate_earned ? 'Earned' : 'Not earned']);
    sheet.getRow(1).font = { bold: true }; sheet.columns.forEach((column) => { column.width = 28; }); sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.attachment('Digital_Literacy_Knowledge_Results.xlsx');
    await workbook.xlsx.write(res); return res.end();
  }
  const doc = new PDFDocument({ size: 'A4', margin: 45 }); res.type('application/pdf'); res.attachment('Digital_Literacy_Knowledge_Report.pdf'); doc.pipe(res);
  doc.fontSize(20).fillColor('#153e75').text('Digital Literacy Knowledge Report').moveDown();
  doc.fontSize(10).fillColor('#475569').text(`Generated ${new Date().toISOString().slice(0, 10)} · ${rows.length} scored attempts, including timed-out attempts`).moveDown();
  for (const row of rows) doc.fontSize(11).fillColor('#17243a').text(`${row.first_name} ${row.last_name} — ${row.title}`).fontSize(10).fillColor('#475569')
    .text(`${row.percentage}% · ${row.level} · ${row.completion_reason === 'time_expired' ? 'Time expired' : 'Submitted'} · ${row.answered_count}/${row.question_count} answered · ${row.completed_at.slice(0, 10)}`).moveDown();
  doc.end();
}));
router.get('/attempts/:id/export/:format', handler(async (req, res) => {
  const attempt = attemptFor(req.user, req.params.id);
  if (attempt.status !== 'completed') throw fail('Complete the assessment before exporting results.', 409);
  const snapshot = JSON.parse(attempt.snapshot_json);
  const score = scoreSnapshot(snapshot, db.prepare('SELECT question_id,answer FROM quiz_responses WHERE attempt_id=?').all(attempt.id));
  const released = answerKeyReleased(req.user, attempt);
  const format = req.params.format;
  if (!['pdf', 'excel', 'certificate'].includes(format)) throw fail('Choose a valid export.');
  if (format === 'certificate' && (!attempt.certificate_earned || process.env.DLAS_FREE_DEMO === 'true')) throw fail('An achievement certificate is not available for this attempt.', 409);
  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Assessment result');
    sheet.addRow(['Student', safeCell(`${attempt.first_name} ${attempt.last_name}`)]);
    sheet.addRow(['Assessment', safeCell(snapshot.title)]); sheet.addRow(['Score', `${score.percentage}%`, score.level]);
    sheet.addRow(['Outcome', attempt.completion_reason === 'time_expired' ? 'Time expired — scored saved answers at the deadline' : 'Submitted by student']);
    if (released) {
      sheet.addRow(['Question', 'Your answer', 'Accepted answer', 'Points earned', 'Points possible']);
      for (const question of score.questions) sheet.addRow([safeCell(question.prompt), safeCell(question.options.find((option) => option.id === question.answer)?.text || question.answer), safeCell(question.answers.map((key) => question.options.find((option) => option.id === key)?.text || key).join(' / ')), question.earned, question.points]);
    } else {
      sheet.addRow(['Review note', 'Detailed answer keys, correctness, and explanations are withheld until all attempts are used and the assessment closes.']);
      sheet.addRow(['Question', 'Your answer', 'Points possible']);
      for (const question of score.questions) sheet.addRow([safeCell(question.prompt), safeCell(question.options.find((option) => option.id === question.answer)?.text || question.answer), question.points]);
    }
    sheet.columns.forEach((column) => { column.width = 32; });
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.attachment(`Knowledge_Result_${attempt.id}.xlsx`); await workbook.xlsx.write(res); return res.end();
  }
  if (format === 'certificate') {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    res.type('application/pdf'); res.attachment(`Masbate_Colleges_Achievement_${attempt.id}.pdf`);
    doc.pipe(res);
    drawCompletionAward(doc, {
      id: attempt.id,
      assessment_title: snapshot.title,
      first_name: attempt.first_name,
      last_name: attempt.last_name,
      completed_at: attempt.completed_at,
      scoring_version: 'knowledge-achievement',
    }, {
      subtitle: 'OF ACHIEVEMENT',
      purpose: 'for meeting the assessment achievement requirement in',
      scoreLine: `${score.level} · ${score.percentage}%`,
      dateLabel: 'ISSUED ON',
      sealLabel: 'ACHIEVED',
      footnote: 'An assessment achievement award issued by this platform; not an external qualification or academic credit.',
    });
    return doc.end();
  }
  const doc = new PDFDocument({ size: 'A4', margin: 45 }); res.type('application/pdf'); res.attachment(`Knowledge_Result_${attempt.id}.pdf`); doc.pipe(res);
  doc.fontSize(20).fillColor('#153e75').text(snapshot.title).moveDown();
  doc.fontSize(12).fillColor('#17243a').text(`${attempt.first_name} ${attempt.last_name}`).text(`${score.percentage}% · ${score.level} · ${score.earned}/${score.possible} points`).moveDown();
  doc.fontSize(10).fillColor('#475569').text(attempt.completion_reason === 'time_expired'
    ? 'Time expired. This result scores answers received by the server before the deadline; the student did not submit before time ended.'
    : 'Submitted by student.').moveDown();
  if (!released) {
    doc.fontSize(10).fillColor('#475569').text('Detailed answer keys, correctness, and explanations are withheld until all attempts are used and the assessment closes.').moveDown();
  }
  for (const question of score.questions) {
    doc.font('Helvetica-Bold').fontSize(11).text(question.prompt);
    const entry = doc.font('Helvetica').fontSize(10).text(`Your answer: ${question.options.find((option) => option.id === question.answer)?.text || question.answer || 'Unanswered'}`);
    if (released) {
      entry.text(`Accepted answer: ${question.answers.map((key) => question.options.find((option) => option.id === key)?.text || key).join(' / ')}`)
        .text(`${question.correct ? 'Correct' : 'Incorrect'} · ${question.earned}/${question.points} points`);
    }
    entry.moveDown();
  }
  return doc.end();
}));

module.exports = router;
