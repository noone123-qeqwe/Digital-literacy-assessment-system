const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { db, logActivity } = require('../db/database');
const { authenticate, authorize } = require('../middleware/auth');
const { questionInput, publicSnapshot, scoreSnapshot, shuffled } = require('../utils/knowledgeQuiz');

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
  const permitted = user.role === 'admin' || (user.role === 'assessor' && quiz.created_by === user.id)
    || (user.role === 'respondent' && db.prepare('SELECT 1 FROM quiz_assignments WHERE quiz_id=? AND user_id=?').get(quiz.id, user.id));
  if (!permitted) throw fail('You do not have access to this assessment.', 403);
  return quiz;
}
function attemptFor(user, attemptId) {
  const attempt = db.prepare(`SELECT a.*, u.first_name, u.last_name, q.created_by
    FROM quiz_attempts a JOIN users u ON u.id=a.user_id JOIN knowledge_quizzes q ON q.id=a.quiz_id WHERE a.id=?`).get(id(attemptId));
  if (!attempt) throw fail('Attempt not found.', 404);
  if (!(user.role === 'admin' || (user.role === 'assessor' && attempt.created_by === user.id) || (user.role === 'respondent' && attempt.user_id === user.id))) throw fail('You cannot access this student’s attempt.', 403);
  return attempt;
}
function attemptData(attempt) {
  const snapshot = JSON.parse(attempt.snapshot_json);
  const responses = db.prepare('SELECT question_id,answer FROM quiz_responses WHERE attempt_id=?').all(attempt.id);
  const { snapshot_json, ...safeAttempt } = attempt;
  return { attempt: safeAttempt, snapshot: publicSnapshot(snapshot), responses, server_now: new Date().toISOString(),
    expired: Boolean(attempt.deadline && Date.now() >= Date.parse(attempt.deadline)),
    results: attempt.status === 'completed' ? scoreSnapshot(snapshot, responses) : null };
}
function categoryExists(categoryId) {
  if (!db.prepare('SELECT id FROM quiz_categories WHERE id=?').get(categoryId)) throw fail('Choose an existing category.');
}
function reportRows(user) {
  const scope = user.role === 'admin' ? '1=1' : user.role === 'assessor' ? 'q.created_by=?' : 'a.user_id=?';
  return db.prepare(`SELECT a.id,a.quiz_id,a.user_id,a.percentage,a.level,a.certificate_earned,a.started_at,a.completed_at,
      a.earned_points,a.possible_points,u.first_name,u.last_name,q.title
    FROM quiz_attempts a JOIN knowledge_quizzes q ON q.id=a.quiz_id JOIN users u ON u.id=a.user_id
    WHERE a.status='completed' AND ${scope} ORDER BY a.completed_at DESC,a.id DESC`).all(...(user.role === 'admin' ? [] : [user.id]));
}

router.get('/students', authorize('admin', 'assessor'), handler((req, res) => {
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

router.get('/questions', authorize('admin', 'assessor'), handler((_req, res) => result(res,
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
  const scope = req.user.role === 'admin' ? '1=1' : req.user.role === 'assessor' ? 'q.created_by=?'
    : `EXISTS(SELECT 1 FROM quiz_assignments aa WHERE aa.quiz_id=q.id AND aa.user_id=?) AND (q.status='published' OR EXISTS(SELECT 1 FROM quiz_attempts ip WHERE ip.quiz_id=q.id AND ip.user_id=${Number(req.user.id)} AND ip.status='in_progress'))`;
  const rows = db.prepare(`SELECT q.id,q.title,q.description,q.instructions,q.status,q.time_limit_minutes,q.max_attempts,q.pass_percentage,q.start_date,q.end_date,q.created_at,
    json_array_length(q.snapshot_json,'$.questions') question_count,
    (SELECT COUNT(*) FROM quiz_assignments aa WHERE aa.quiz_id=q.id) assigned_count,
    (SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.status='completed') completed_count,
    (SELECT COUNT(*) FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=?) attempt_count,
    (SELECT a.id FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=? ORDER BY a.id DESC LIMIT 1) latest_attempt_id,
    (SELECT a.status FROM quiz_attempts a WHERE a.quiz_id=q.id AND a.user_id=? ORDER BY a.id DESC LIMIT 1) latest_status
    FROM knowledge_quizzes q WHERE ${scope} ORDER BY q.id DESC`).all(req.user.id, req.user.id, req.user.id, ...(req.user.role === 'admin' ? [] : [req.user.id]));
  return result(res, rows);
}));
router.get('/quizzes/:id', handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  const { snapshot_json, ...safe } = quiz;
  return result(res, { ...safe, snapshot: req.user.role === 'respondent' ? undefined : JSON.parse(snapshot_json),
    assigned_user_ids: req.user.role === 'respondent' ? undefined : db.prepare('SELECT user_id FROM quiz_assignments WHERE quiz_id=?').all(quiz.id).map((row) => row.user_id) });
}));
router.post('/quizzes', authorize('admin', 'assessor'), handler((req, res) => {
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
router.put('/quizzes/:id/status', authorize('admin', 'assessor'), handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  if (!['draft', 'published', 'archived'].includes(req.body.status)) throw fail('Choose a valid publication status.');
  db.prepare('UPDATE knowledge_quizzes SET status=? WHERE id=?').run(req.body.status, quiz.id);
  logActivity(req.user.id, 'KNOWLEDGE_ASSESSMENT_STATUS', `Assessment #${quiz.id}: ${req.body.status}`);
  return result(res, null, 'Publication status updated. In-progress students retain their saved attempt.');
}));
router.post('/quizzes/:id/assign', authorize('admin', 'assessor'), handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  if (!Array.isArray(req.body.user_ids) || req.body.user_ids.length > 5000) throw fail('Choose a valid student list.');
  const ids = [...new Set(req.body.user_ids.map(id))];
  for (const userId of ids) if (!db.prepare("SELECT 1 FROM users WHERE id=? AND role='respondent' AND status='active' AND email_verified=1").get(userId)) throw fail('Choose active, verified students.');
  db.transaction(() => { for (const userId of ids) db.prepare('INSERT INTO quiz_assignments(quiz_id,user_id,assigned_by) VALUES(?,?,?) ON CONFLICT DO NOTHING').run(quiz.id, userId, req.user.id); })();
  logActivity(req.user.id, 'KNOWLEDGE_ASSIGN', `Assigned ${ids.length} students to #${quiz.id}`);
  return result(res, null, 'Students assigned.');
}));
router.delete('/quizzes/:id', authorize('admin', 'assessor'), handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  if (db.prepare('SELECT id FROM quiz_attempts WHERE quiz_id=?').get(quiz.id)) throw fail('This assessment has attempts. Archive it to preserve student results.', 409);
  db.prepare('DELETE FROM knowledge_quizzes WHERE id=?').run(quiz.id);
  logActivity(req.user.id, 'KNOWLEDGE_ASSESSMENT_DELETE', `Deleted unattempted assessment #${quiz.id}`);
  return result(res, null, 'Assessment deleted.');
}));

router.post('/quizzes/:id/start', authorize('respondent'), handler((req, res) => {
  const quiz = quizFor(req.user, req.params.id);
  const ongoing = db.prepare("SELECT * FROM quiz_attempts WHERE quiz_id=? AND user_id=? AND status='in_progress'").get(quiz.id, req.user.id);
  if (ongoing) return result(res, attemptData(ongoing));
  if (quiz.status !== 'published') throw fail('This assessment is not accepting new attempts.', 409);
  const now = Date.now();
  if (quiz.start_date && Date.parse(quiz.start_date) > now) throw fail('This assessment has not opened yet.', 409);
  if (quiz.end_date && Date.parse(quiz.end_date) <= now) throw fail('The assessment deadline has passed.', 410);
  if (req.body.accepted_instructions !== true) throw fail('Confirm the instructions and independent-work statement before beginning.');
  if (db.prepare('SELECT COUNT(*) count FROM quiz_attempts WHERE quiz_id=? AND user_id=?').get(quiz.id, req.user.id).count >= quiz.max_attempts) throw fail('You have used all permitted attempts.', 409);
  const snapshot = JSON.parse(quiz.snapshot_json);
  if (quiz.randomize) snapshot.questions = shuffled(snapshot.questions).map((question) => ({ ...question, options: question.type === 'multiple_choice' ? shuffled(question.options) : question.options }));
  const limits = [quiz.time_limit_minutes ? now + quiz.time_limit_minutes * 60000 : null, quiz.end_date ? Date.parse(quiz.end_date) : null].filter((value) => value !== null);
  const startedAt = new Date(now).toISOString();
  const attemptId = db.prepare('INSERT INTO quiz_attempts(quiz_id,user_id,snapshot_json,deadline,started_at,integrity_confirmed_at) VALUES(?,?,?,?,?,?)')
    .run(quiz.id, req.user.id, JSON.stringify(snapshot), limits.length ? new Date(Math.min(...limits)).toISOString() : null, startedAt, startedAt).lastInsertRowid;
  logActivity(req.user.id, 'KNOWLEDGE_ATTEMPT_START', `Started knowledge attempt #${attemptId}`);
  return result(res, attemptData(attemptFor(req.user, attemptId)), 'Assessment started.');
}));
router.get('/attempts/:id', handler((req, res) => result(res, attemptData(attemptFor(req.user, req.params.id)))));
router.put('/attempts/:id/answers', authorize('respondent'), handler((req, res) => {
  const attempt = attemptFor(req.user, req.params.id);
  if (attempt.status !== 'in_progress') throw fail('Completed answers cannot be changed.', 409);
  if (attempt.deadline && Date.now() >= Date.parse(attempt.deadline)) throw fail('Time has ended. Only answers received before the deadline can be scored.', 410);
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
  if (attempt.status === 'completed') return result(res, attemptData(attempt));
  const responses = db.prepare('SELECT question_id,answer FROM quiz_responses WHERE attempt_id=?').all(attempt.id);
  const snapshot = JSON.parse(attempt.snapshot_json);
  const expired = attempt.deadline && Date.now() >= Date.parse(attempt.deadline);
  if (!expired && (responses.filter((response) => response.answer.trim()).length !== snapshot.questions.length)) throw fail('Answer every question before submitting.');
  const score = scoreSnapshot(snapshot, responses);
  db.transaction(() => {
    db.prepare("UPDATE quiz_attempts SET status='completed',completed_at=?,earned_points=?,possible_points=?,percentage=?,level=?,certificate_earned=? WHERE id=? AND status='in_progress'")
      .run(new Date().toISOString(), score.earned, score.possible, score.percentage, score.level, score.certificateEarned ? 1 : 0, attempt.id);
    for (const category of score.categories) db.prepare('INSERT INTO quiz_category_results(attempt_id,category_id,category_name,earned,possible,percentage) VALUES(?,?,?,?,?,?)')
      .run(attempt.id, category.id, category.name, category.earned, category.possible, category.percentage);
    logActivity(req.user.id, 'KNOWLEDGE_ATTEMPT_COMPLETE', `Completed knowledge assessment #${attempt.quiz_id}`);
  })();
  return result(res, attemptData(attemptFor(req.user, attempt.id)), 'Assessment scored.');
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
  const scope = req.user.role === 'admin' ? '1=1' : req.user.role === 'assessor' ? 'q.created_by=?' : 'aa.user_id=?';
  const params = req.user.role === 'admin' ? [] : [req.user.id];
  const pendingAssignments = db.prepare(`SELECT COUNT(*) count FROM quiz_assignments aa JOIN knowledge_quizzes q ON q.id=aa.quiz_id
    WHERE ${scope} AND (q.status='published' OR EXISTS(SELECT 1 FROM quiz_attempts ip WHERE ip.quiz_id=q.id AND ip.user_id=aa.user_id AND ip.status='in_progress'))
    AND NOT EXISTS(SELECT 1 FROM quiz_attempts done WHERE done.quiz_id=q.id AND done.user_id=aa.user_id AND done.status='completed')`).get(...params).count;
  const assignedQuizCount = db.prepare(`SELECT COUNT(DISTINCT aa.quiz_id) count FROM quiz_assignments aa JOIN knowledge_quizzes q ON q.id=aa.quiz_id
    WHERE ${scope} AND (q.status='published' OR EXISTS(SELECT 1 FROM quiz_attempts old WHERE old.quiz_id=q.id AND old.user_id=aa.user_id))`).get(...params).count;
  const cohortStudents = req.user.role === 'assessor' ? db.prepare(`SELECT COUNT(DISTINCT aa.user_id) count FROM quiz_assignments aa JOIN knowledge_quizzes q ON q.id=aa.quiz_id WHERE q.created_by=?`).get(req.user.id).count : null;
  const scoreScope = req.user.role === 'admin' ? '1=1' : req.user.role === 'assessor' ? 'q.created_by=?' : 'a.user_id=?';
  const categoryScores = db.prepare(`SELECT cr.category_id id,COALESCE(c.name,MAX(cr.category_name)) name,SUM(cr.earned) earned,SUM(cr.possible) possible
    FROM quiz_category_results cr JOIN quiz_attempts a ON a.id=cr.attempt_id JOIN knowledge_quizzes q ON q.id=a.quiz_id LEFT JOIN quiz_categories c ON c.id=cr.category_id
    WHERE ${scoreScope} AND NOT EXISTS(SELECT 1 FROM quiz_attempts newer WHERE newer.user_id=a.user_id AND newer.quiz_id=a.quiz_id AND newer.status='completed'
      AND (newer.completed_at>a.completed_at OR (newer.completed_at=a.completed_at AND newer.id>a.id))) GROUP BY cr.category_id,c.name`).all(...params);
  const comparisons = rows.map((row) => {
    const history = histories.get(`${row.user_id}:${row.quiz_id}`);
    const first = history[history.length - 1];
    return { user_id: row.user_id, name: `${row.first_name} ${row.last_name}`, quiz_id: row.quiz_id, title: row.title,
      first: first.percentage, latest: row.percentage, change: Math.round((row.percentage - first.percentage) * 100) / 100, attempts: history.length };
  });
  const average = rows.length ? rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length : null;
  const activities = req.user.role === 'admin' ? db.prepare(`SELECT l.action,l.details,l.created_at,u.first_name,u.last_name FROM activity_log l JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 8`).all()
    : db.prepare('SELECT action,details,created_at FROM activity_log WHERE user_id=? ORDER BY id DESC LIMIT 8').all(req.user.id);
  return result(res, {
    summary: { registeredStudents: req.user.role === 'admin' ? db.prepare("SELECT COUNT(*) count FROM users WHERE role='respondent'").get().count : cohortStudents ?? 1,
      totalAssessments: req.user.role === 'admin' ? db.prepare("SELECT COUNT(*) count FROM knowledge_quizzes WHERE status<>'archived'").get().count
        : req.user.role === 'assessor' ? db.prepare("SELECT COUNT(*) count FROM knowledge_quizzes WHERE created_by=? AND status<>'archived'").get(req.user.id).count : assignedQuizCount,
      completed: rows.length, pending: pendingAssignments, average: average === null ? null : Math.round(average * 100) / 100,
      highest: rows.length ? Math.max(...rows.map((row) => row.percentage)) : null, lowest: rows.length ? Math.min(...rows.map((row) => row.percentage)) : null,
      certificates: allRows.filter((row) => row.certificate_earned).length },
    distribution: ['Advanced', 'Proficient', 'Developing', 'Beginner', 'Needs Improvement'].map((level) => ({ level, count: rows.filter((row) => row.level === level).length })),
    categories: categoryScores.map((category) => ({ ...category, percentage: Math.round(category.earned / category.possible * 10000) / 100 })),
    history: allRows.slice(0, 500), totalHistory: allRows.length,
    comparisons: comparisons.slice(0, 500), activities,
  });
}));

router.get('/materials', handler((req, res) => result(res, db.prepare(`SELECT m.*,c.name category_name,
  EXISTS(SELECT 1 FROM quiz_material_completions mc WHERE mc.material_id=m.id AND mc.user_id=?) completed
  FROM quiz_materials m JOIN quiz_categories c ON c.id=m.category_id ${req.user.role === 'admin' ? '' : 'WHERE m.is_published=1'} ORDER BY c.id,m.id`).all(req.user.id))));
function saveMaterial(req, res, materialId = null) {
  const categoryId = id(req.body.category_id); categoryExists(categoryId);
  const title = text(req.body.title, 3, 160, 'Title');
  const content = text(req.body.content, 20, 12000, 'Learning guide');
  const url = text(req.body.resource_url || '', 0, 500, 'Resource link');
  if (url) { let parsed; try { parsed = new URL(url); } catch { throw fail('Enter a complete HTTPS resource URL.'); } if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw fail('Resource links must use HTTPS without credentials.'); }
  if (typeof req.body.is_published !== 'boolean') throw fail('Choose a publication setting.');
  if (materialId) {
    if (!db.prepare('SELECT id FROM quiz_materials WHERE id=?').get(materialId)) throw fail('Learning guide not found.', 404);
    db.transaction(() => {
      db.prepare('UPDATE quiz_materials SET category_id=?,title=?,content=?,resource_url=?,is_published=? WHERE id=?').run(categoryId, title, content, url, req.body.is_published ? 1 : 0, materialId);
      db.prepare('DELETE FROM quiz_material_completions WHERE material_id=?').run(materialId);
    })();
  } else materialId = db.prepare('INSERT INTO quiz_materials(category_id,title,content,resource_url,is_published) VALUES(?,?,?,?,?)').run(categoryId, title, content, url, req.body.is_published ? 1 : 0).lastInsertRowid;
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
router.get('/reports/:format', authorize('admin', 'assessor'), handler(async (req, res) => {
  const rows = reportRows(req.user);
  if (!['pdf', 'excel'].includes(req.params.format)) throw fail('Choose PDF or Excel.');
  if (req.params.format === 'excel') {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Knowledge results');
    sheet.addRow(['Student', 'Assessment', 'Score (%)', 'Level', 'Date', 'Achievement certificate']);
    for (const row of rows) sheet.addRow([safeCell(`${row.first_name} ${row.last_name}`), safeCell(row.title), row.percentage, row.level, row.completed_at, row.certificate_earned ? 'Earned' : 'Not earned']);
    sheet.getRow(1).font = { bold: true }; sheet.columns.forEach((column) => { column.width = 28; }); sheet.views = [{ state: 'frozen', ySplit: 1 }];
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.attachment('Digital_Literacy_Knowledge_Results.xlsx');
    await workbook.xlsx.write(res); return res.end();
  }
  const doc = new PDFDocument({ size: 'A4', margin: 45 }); res.type('application/pdf'); res.attachment('Digital_Literacy_Knowledge_Report.pdf'); doc.pipe(res);
  doc.fontSize(20).fillColor('#153e75').text('Digital Literacy Knowledge Report').moveDown();
  doc.fontSize(10).fillColor('#475569').text(`Generated ${new Date().toISOString().slice(0, 10)} · ${rows.length} completed attempts`).moveDown();
  for (const row of rows) doc.fontSize(11).fillColor('#17243a').text(`${row.first_name} ${row.last_name} — ${row.title}`).fontSize(10).fillColor('#475569').text(`${row.percentage}% · ${row.level} · ${row.completed_at.slice(0, 10)}`).moveDown();
  doc.end();
}));
router.get('/attempts/:id/export/:format', handler(async (req, res) => {
  const attempt = attemptFor(req.user, req.params.id);
  if (attempt.status !== 'completed') throw fail('Complete the assessment before exporting results.', 409);
  const snapshot = JSON.parse(attempt.snapshot_json);
  const score = scoreSnapshot(snapshot, db.prepare('SELECT question_id,answer FROM quiz_responses WHERE attempt_id=?').all(attempt.id));
  const format = req.params.format;
  if (!['pdf', 'excel', 'certificate'].includes(format)) throw fail('Choose a valid export.');
  if (format === 'certificate' && (!attempt.certificate_earned || process.env.DLAS_FREE_DEMO === 'true')) throw fail('An achievement certificate is not available for this attempt.', 409);
  if (format === 'excel') {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Assessment result');
    sheet.addRow(['Student', safeCell(`${attempt.first_name} ${attempt.last_name}`)]);
    sheet.addRow(['Assessment', safeCell(snapshot.title)]); sheet.addRow(['Score', `${score.percentage}%`, score.level]);
    sheet.addRow(['Question', 'Your answer', 'Accepted answer', 'Points earned', 'Points possible']);
    for (const question of score.questions) sheet.addRow([safeCell(question.prompt), safeCell(question.options.find((option) => option.id === question.answer)?.text || question.answer), safeCell(question.answers.map((key) => question.options.find((option) => option.id === key)?.text || key).join(' / ')), question.earned, question.points]);
    sheet.columns.forEach((column) => { column.width = 32; });
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.attachment(`Knowledge_Result_${attempt.id}.xlsx`); await workbook.xlsx.write(res); return res.end();
  }
  if (format === 'certificate') {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    res.type('application/pdf'); res.attachment(`Masbate_Colleges_Achievement_${attempt.id}.pdf`); doc.pipe(res);
    doc.rect(0, 0, 842, 595).fill('#f8fbff'); doc.rect(25, 25, 792, 545).lineWidth(2).stroke('#2563eb');
    doc.fillColor('#153e75').font('Helvetica-Bold').fontSize(17).text('MASBATE COLLEGES', 70, 66, { width: 702, align: 'center' });
    doc.font('Times-Roman').fontSize(40).text('Certificate of Achievement', 70, 125, { width: 702, align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#64748b').text('Presented to', 70, 201, { width: 702, align: 'center' });
    const name = `${attempt.first_name} ${attempt.last_name}`;
    let size = 33; doc.font('Times-Italic').fontSize(size);
    while (doc.heightOfString(name, { width: 702, align: 'center' }) > 65 && size > 9) doc.fontSize(--size);
    doc.fillColor('#153e75').text(name, 70, 232, { width: 702, align: 'center' });
    doc.font('Helvetica').fontSize(12).fillColor('#475569').text('For meeting the assessment achievement requirement in', 70, 308, { width: 702, align: 'center' });
    size = 17; doc.font('Helvetica-Bold').fontSize(size);
    while (doc.heightOfString(snapshot.title, { width: 642, align: 'center' }) > 65 && size > 9) doc.fontSize(--size);
    doc.fillColor('#17243a').text(snapshot.title, 100, 341, { width: 642, align: 'center' });
    doc.fontSize(16).fillColor('#2563eb').text(`${score.level} · ${score.percentage}%`, 70, 421, { width: 702, align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#475569').text(`Completed ${attempt.completed_at.slice(0, 10)}     ·     MC-KQ-${String(attempt.id).padStart(7, '0')}`, 70, 480, { width: 702, align: 'center' });
    doc.fontSize(8).text('An assessment achievement award issued by this platform; not an external qualification or academic credit.', 70, 530, { width: 702, align: 'center' });
    return doc.end();
  }
  const doc = new PDFDocument({ size: 'A4', margin: 45 }); res.type('application/pdf'); res.attachment(`Knowledge_Result_${attempt.id}.pdf`); doc.pipe(res);
  doc.fontSize(20).fillColor('#153e75').text(snapshot.title).moveDown();
  doc.fontSize(12).fillColor('#17243a').text(`${attempt.first_name} ${attempt.last_name}`).text(`${score.percentage}% · ${score.level} · ${score.earned}/${score.possible} points`).moveDown();
  for (const question of score.questions) {
    doc.font('Helvetica-Bold').fontSize(11).text(question.prompt);
    doc.font('Helvetica').fontSize(10).text(`Your answer: ${question.options.find((option) => option.id === question.answer)?.text || question.answer || 'Unanswered'}`)
      .text(`Accepted answer: ${question.answers.map((key) => question.options.find((option) => option.id === key)?.text || key).join(' / ')}`)
      .text(`${question.correct ? 'Correct' : 'Incorrect'} · ${question.earned}/${question.points} points`).moveDown();
  }
  return doc.end();
}));

module.exports = router;
