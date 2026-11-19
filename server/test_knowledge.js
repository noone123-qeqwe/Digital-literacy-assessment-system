// Isolated API checks for scored quizzes; never uses the configured study database.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-knowledge-test-'));
process.env.NODE_ENV = 'test';
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'BACKUP_STRATEGY', 'DLAS_RESEARCH_ENABLED', 'SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS', 'BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_HOST', 'MAIL_FROM', 'MAIL_FROM_ADDRESS', 'MAIL_USER', 'MAIL_USERNAME', 'MAIL_PASS', 'MAIL_PASSWORD']) process.env[key] = '';
process.env.EMAIL_PROVIDER = 'smtp';
process.env.DLAS_FREE_DEMO = 'false';
process.env.DLAS_DB_PATH = path.join(temporaryDirectory, 'knowledge.sqlite');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.BACKUP_ENCRYPTION_KEY = '';
const { startServer } = require('./server');
const { db, initializeDatabase } = require('./db/database');
const { seed } = require('./db/seed');
const { levelFor } = require('./utils/knowledgeQuiz');
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; console.log(`  PASS ${message}`); }
function session(user) {
  const sessionId = crypto.randomUUID();
  db.prepare("UPDATE users SET email_verified=1,mfa_enabled=CASE WHEN role='respondent' THEN 0 ELSE 1 END WHERE id=?").run(user.id);
  db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at,mfa_verified) VALUES(?,?,?,1)').run(sessionId, user.id, new Date(Date.now() + 3600000).toISOString());
  const token = jwt.sign({ id: user.id, jti: sessionId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const csrf = crypto.randomBytes(16).toString('hex');
  return { cookie: `dlas_session=${token}; dlas_csrf=${csrf}`, csrf, id: user.id };
}
async function run() {
  const server = startServer(0); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/knowledge`;
  const request = async (route, { actor, method = 'GET', body, csrf = true } = {}) => {
    const answerAttempt = /^\/attempts\/(\d+)\/answers$/.exec(route);
    if (method === 'PUT' && answerAttempt && body && body.expected_revision === undefined) body = { ...body, expected_revision: db.prepare('SELECT answers_revision FROM quiz_attempts WHERE id=?').get(Number(answerAttempt[1]))?.answers_revision ?? 0 };
    const headers = actor ? { Cookie: actor.cookie, ...(csrf ? { 'X-CSRF-Token': actor.csrf } : {}) } : {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = response.headers.get('content-type')?.includes('application/json');
    return { status: response.status, data: json ? await response.json() : Buffer.from(await response.arrayBuffer()), headers: response.headers };
  };
  try {
    seed();
    const admin = session(db.prepare("SELECT id FROM users WHERE role='admin'").get());
    const maria = session(db.prepare("SELECT id FROM users WHERE email='maria.santos@example.com'").get());
    const juan = session(db.prepare("SELECT id FROM users WHERE email='juan.delacruz@example.com'").get());
    const staffId = db.prepare("INSERT INTO users(email,password,first_name,last_name,role,status,email_verified,mfa_enabled) VALUES('teacher@example.test','test-only','Test','Teacher','assessor','active',1,1)").run().lastInsertRowid;
    const teacher = session({ id: staffId });
    console.log('\nKnowledge assessment integration checks');
    initializeDatabase();
    const categories = await request('/categories', { actor: admin });
    check(categories.status === 200 && categories.data.data.length === 8, 'the eight categories initialize idempotently');
    check(db.prepare('SELECT COUNT(*) count FROM quiz_questions').get().count === 24 && db.prepare('SELECT COUNT(*) count FROM knowledge_quizzes').get().count === 3 && db.prepare('SELECT COUNT(*) count FROM quiz_attempts').get().count === 0, 'demo question bank and assignments contain no fabricated results');
    check((await request('/categories')).status === 401, 'quiz endpoints require a signed-in session');
    check((await request('/questions', { actor: maria })).status === 403, 'students cannot read the answer bank');
    check((await request('/categories', { actor: admin, method: 'POST', body: { name: 'New topic' }, csrf: false })).status === 403, 'mutations enforce CSRF protection');
    const category = categories.data.data[0];
    const kinds = [
      { category_id: category.id, prompt: 'Which option represents a trusted backup?', type: 'multiple_choice', options: ['Encrypted offline backup', 'No saved copy'], correct_answer: '0', points: 2, explanation: 'An encrypted offline copy helps recovery.' },
      { category_id: category.id, prompt: 'A password can be safely shared with anyone.', type: 'true_false', correct_answer: 'false', points: 1 },
      { category_id: categories.data.data[1].id, prompt: 'Name the common abbreviation for the central processing unit.', type: 'identification', accepted_answers: ['CPU', 'central processing unit'], points: 1 },
    ];
    const ids = [];
    for (const question of kinds) {
      const added = await request('/questions', { actor: admin, method: 'POST', body: question });
      check(added.status === 200, `${question.type} supports authored correct answers and points`); ids.push(added.data.data.id);
    }
    check((await request('/questions', { actor: teacher, method: 'POST', body: kinds[0] })).status === 403, 'teachers cannot change the administrator question bank');
    check((await request('/questions', { actor: admin, method: 'POST', body: { ...kinds[0], options: ['same', 'SAME'] } })).status === 400, 'duplicate answer choices are rejected');
    check((await request('/questions', { actor: admin, method: 'POST', body: { ...kinds[2], accepted_answers: [{}] } })).status === 400, 'identification keys reject non-text input');
    const config = { title: 'Knowledge API workflow check', question_ids: ids, assigned_user_ids: [maria.id], status: 'published', max_attempts: 2, pass_percentage: 80, randomize: true, time_limit_minutes: 15 };
    const created = await request('/quizzes', { actor: admin, method: 'POST', body: config });
    check(created.status === 201, 'staff can create a published assessment and assign selected students');
    const quizId = created.data.data.id;
    check((await request('/quizzes', { actor: maria, method: 'POST', body: config })).status === 403, 'students cannot create assessments');
    check((await request(`/quizzes/${quizId}`, { actor: juan })).status === 403, 'unassigned students cannot inspect assessments');
    check((await request(`/quizzes/${quizId}/start`, { actor: maria, method: 'POST', body: {} })).status === 400, 'independent-work instructions require confirmation');
    const started = await request(`/quizzes/${quizId}/start`, { actor: maria, method: 'POST', body: { accepted_instructions: true } });
    check(started.status === 200 && started.data.data.snapshot.questions.length === 3, 'an assigned student starts a snapshotted timed assessment');
    const attemptId = started.data.data.attempt.id;
    check(started.data.data.snapshot.questions.every((question) => !('answers' in question) && !('explanation' in question)) && !('snapshot_json' in started.data.data.attempt), 'active attempt responses never expose answer keys or raw snapshots');
    const q0 = started.data.data.snapshot.questions.find((q) => q.id === ids[0]);
    const q0CorrectId = q0.options.find((option) => option.text === 'Encrypted offline backup').id;
    const q0WrongId = q0.options.find((option) => option.text === 'No saved copy').id;
    check(!/^[0-5]$/.test(q0CorrectId) && !/^[0-5]$/.test(q0WrongId), 'multiple-choice option IDs are randomized per attempt rather than sequential indexes');
    const resume = await request(`/quizzes/${quizId}/start`, { actor: maria, method: 'POST', body: {} });
    check(resume.data.data.attempt.id === attemptId && JSON.stringify(resume.data.data.snapshot) === JSON.stringify(started.data.data.snapshot), 'reopening an interrupted quiz resumes the same ordered snapshot');
    check((await request(`/attempts/${attemptId}`, { actor: juan })).status === 403 && (await request(`/attempts/${attemptId}`, { actor: teacher })).status === 403, 'attempt ownership is enforced for students and unrelated teachers');
    check((await request(`/attempts/${attemptId}/integrity`, { actor: maria, method: 'POST', body: { event_type: 'page_hidden', detail: 'tab_hidden' } })).status === 200
      && (await request(`/attempts/${attemptId}/integrity`, { actor: maria, method: 'POST', body: { event_type: 'copy_attempt', detail: 'copy' } })).status === 200
      && (await request(`/attempts/${attemptId}/integrity`, { actor: maria, method: 'POST', body: { event_type: 'bogus_event' } })).status === 400, 'integrity endpoint logs supported proctoring signals and rejects unknown types');
    const mariaSecondSession = session(db.prepare("SELECT id FROM users WHERE email='maria.santos@example.com'").get());
    check((await request(`/attempts/${attemptId}`, { actor: mariaSecondSession })).status === 200, 'second session read triggers extra-session integrity tracking');
    const invalidBatch = await request(`/attempts/${attemptId}/answers`, { actor: maria, method: 'PUT', body: { responses: [{ question_id: ids[0], answer: q0CorrectId }, { question_id: 999999, answer: '0' }] } });
    check(invalidBatch.status === 400 && db.prepare('SELECT COUNT(*) count FROM quiz_responses WHERE attempt_id=?').get(attemptId).count === 0, 'a batch with a foreign question writes no partial answers');
    const answers = { responses: [{ question_id: ids[0], answer: q0CorrectId }, { question_id: ids[1], answer: 'false' }, { question_id: ids[2], answer: '  central   PROCESSING unit ' }] };
    check((await request(`/attempts/${attemptId}/submit`, { actor: maria, method: 'POST' })).status === 400, 'unanswered quizzes cannot be submitted before the deadline');
    await request(`/attempts/${attemptId}/answers`, { actor: maria, method: 'PUT', body: answers });
    await request(`/attempts/${attemptId}/answers`, { actor: maria, method: 'PUT', body: answers });
    check(db.prepare('SELECT COUNT(*) count FROM quiz_responses WHERE attempt_id=?').get(attemptId).count === 3, 'replayed answer uploads are idempotent');
    const stale = await request(`/attempts/${attemptId}/answers`, { actor: maria, method: 'PUT', body: { expected_revision: 0, responses: [{ question_id: ids[0], answer: q0WrongId }] } });
    check(stale.status === 409 && db.prepare('SELECT answer FROM quiz_responses WHERE attempt_id=? AND question_id=?').get(attemptId, ids[0]).answer === q0CorrectId, 'stale tab uploads cannot silently overwrite newer answers');
    await request(`/questions/${ids[0]}`, { actor: admin, method: 'PUT', body: { ...kinds[0], correct_answer: '1', prompt: 'Updated question after assessment creation.' } });
    const completed = await request(`/attempts/${attemptId}/submit`, { actor: maria, method: 'POST' });
    check(completed.status === 200 && completed.data.data.results.percentage === 100 && completed.data.data.results.level === 'Advanced', 'weighted points and normalized identification produce the expected percentage');
    check(completed.data.data.results.review_locked === true && completed.data.data.answer_key_released === false
      && completed.data.data.results.questions.every((item) => !('answers' in item) && !('explanation' in item) && !('correct' in item))
      && !('integrity' in completed.data.data), 'student result review withholds answer keys, explanations, and integrity telemetry while attempts remain');
    const adminAttemptView = await request(`/attempts/${attemptId}`, { actor: admin });
    check(adminAttemptView.data.data.answer_key_released === true && adminAttemptView.data.data.integrity.page_hidden === 1 && adminAttemptView.data.data.integrity.copy_attempt === 1 && adminAttemptView.data.data.integrity.new_session === 1, 'administrators can inspect full answer review and recorded integrity signals');
    check(completed.data.data.results.questions[0].prompt !== 'Updated question after assessment creation.' || completed.data.data.results.questions.find((item) => item.id === ids[0]).prompt === kinds[0].prompt, 'bank edits leave assessment wording and answer snapshots unchanged');
    check(completed.data.data.results.certificateEarned && completed.data.data.attempt.certificate_earned === 1, 'meeting the configured threshold earns an achievement certificate');
    check((await request(`/attempts/${attemptId}/submit`, { actor: maria, method: 'POST' })).status === 200 && db.prepare('SELECT COUNT(*) count FROM quiz_category_results WHERE attempt_id=?').get(attemptId).count === 2, 'repeat submission keeps one result per category');
    check((await request(`/attempts/${attemptId}/answers`, { actor: maria, method: 'PUT', body: answers })).status === 409, 'completed answers cannot be changed');
    for (const format of ['pdf', 'excel', 'certificate']) {
      const exported = await request(`/attempts/${attemptId}/export/${format}`, { actor: maria });
      check(exported.status === 200 && exported.data.length > 1000 && (format === 'excel' ? exported.data.subarray(0, 2).toString() === 'PK' : exported.data.subarray(0, 4).toString() === '%PDF'), `own ${format} export generates a valid file`);
      if (format === 'excel') {
        const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(exported.data);
        check(workbook.worksheets[0].getRow(1).getCell(2).value === 'Maria Santos', 'Excel result includes the authenticated participant’s name');
        const headerRow = workbook.worksheets[0].getRow(6).values;
        check(!headerRow.includes('Accepted answer'), 'student Excel export withholds accepted answers before key release');
      }
      if (process.env.DLAS_KEEP_QUIZ_ARTIFACTS === 'true') fs.writeFileSync(path.join(os.tmpdir(), `dlas-knowledge-sample.${format === 'excel' ? 'xlsx' : format === 'certificate' ? 'certificate.pdf' : 'pdf'}`), exported.data);
    }
    check((await request(`/attempts/${attemptId}/export/certificate`, { actor: juan })).status === 403, 'certificate downloads enforce ownership');
    const second = await request(`/quizzes/${quizId}/start`, { actor: maria, method: 'POST', body: { accepted_instructions: true } });
    const secondId = second.data.data.attempt.id;
    const secondQ0 = second.data.data.snapshot.questions.find((q) => q.id === ids[0]);
    const secondQ0WrongId = secondQ0.options.find((option) => option.text === 'No saved copy').id;
    check(secondQ0WrongId !== q0WrongId, 'each new attempt assigns fresh opaque option IDs');
    await request(`/attempts/${secondId}/answers`, { actor: maria, method: 'PUT', body: { responses: [{ question_id: ids[0], answer: secondQ0WrongId }, { question_id: ids[1], answer: 'true' }, { question_id: ids[2], answer: 'wrong' }] } });
    const secondResult = await request(`/attempts/${secondId}/submit`, { actor: maria, method: 'POST' });
    check(secondResult.data.data.results.percentage === 0 && secondResult.data.data.results.level === 'Needs Improvement', 'incorrect answers earn zero and the correct lower proficiency');
    check(secondResult.data.data.answer_key_released === false, 'answer key remains withheld while the quiz is still open for classmates');
    await request(`/quizzes/${quizId}/status`, { actor: admin, method: 'PUT', body: { status: 'archived' } });
    const afterClose = await request(`/attempts/${secondId}`, { actor: maria });
    check(afterClose.data.data.answer_key_released === true && afterClose.data.data.results.questions.every((item) => Array.isArray(item.answers)), 'answer keys unlock after all attempts are used and the assessment closes');
    check((await request(`/attempts/${secondId}/export/certificate`, { actor: maria })).status === 409, 'students below the threshold cannot generate achievement certificates');
    check((await request(`/quizzes/${quizId}/start`, { actor: maria, method: 'POST', body: { accepted_instructions: true } })).status === 409, 'configured attempt limit is enforced');
    const overview = await request('/overview', { actor: maria });
    const comparison = overview.data.data.comparisons.find((item) => item.quiz_id === quizId);
    check(comparison.first === 100 && comparison.latest === 0 && comparison.change === -100 && comparison.attempts === 2, 'progress compares the first and latest attempts of the same snapshot');
    check(overview.data.data.categories.every((item) => item.percentage === 0), 'category charts use latest results instead of double-counting retakes');
    check((await request('/quizzes', { actor: teacher, method: 'POST', body: config })).status === 403, 'retired teacher accounts cannot create quizzes');
    const teacherQuiz = await request('/quizzes', { actor: admin, method: 'POST', body: { ...config, title: 'Teacher cohort', question_ids: [ids[1]], assigned_user_ids: [juan.id], time_limit_minutes: 1 } });
    check(teacherQuiz.status === 201, 'administrator can create assessments from the approved bank');
    const teacherOverview = await request('/overview', { actor: teacher });
    check(teacherOverview.status === 403, 'retired teacher accounts cannot access analytics');
    const timed = await request(`/quizzes/${teacherQuiz.data.data.id}/start`, { actor: juan, method: 'POST', body: { accepted_instructions: true } });
    const timedId = timed.data.data.attempt.id;
    db.prepare('UPDATE quiz_attempts SET deadline=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), timedId);
    check((await request(`/attempts/${timedId}/answers`, { actor: juan, method: 'PUT', body: { responses: [{ question_id: ids[1], answer: 'false' }] } })).status === 410, 'server deadline rejects late answers');
    check((await request(`/attempts/${timedId}/submit`, { actor: juan, method: 'POST' })).data.data.results.percentage === 0, 'expired attempts can finalize unanswered questions at zero points');
    check((await request(`/attempts/${timedId}`, { actor: teacher })).status === 403, 'retired teacher accounts cannot review assessment results');
    const unpublished = await request('/quizzes', { actor: admin, method: 'POST', body: { ...config, title: 'Draft validation', status: 'draft', max_attempts: 1 } });
    check((await request(`/quizzes/${unpublished.data.data.id}/start`, { actor: maria, method: 'POST', body: { accepted_instructions: true } })).status === 409, 'draft assessments cannot be started');
    const future = await request('/quizzes', { actor: admin, method: 'POST', body: { ...config, title: 'Future validation', start_date: new Date(Date.now() + 3600000).toISOString() } });
    check((await request(`/quizzes/${future.data.data.id}/start`, { actor: maria, method: 'POST', body: { accepted_instructions: true } })).status === 409, 'future schedules cannot be bypassed');
    check((await request(`/quizzes/${quizId}`, { actor: admin, method: 'DELETE' })).status === 409, 'assessments with results require archival rather than deletion');
    const materials = await request('/materials', { actor: maria });
    check(materials.data.data.length === 8 && materials.data.data.every((material) => material.content.length > 3000 && material.image_url.startsWith('/learning/images/') && material.video_url.startsWith('/learning/videos/')), 'all eight categories include detailed learning guides with images and videos');
    const publicDir = path.resolve(__dirname, '..', 'client', 'public');
    check(materials.data.data.every((material) => {
      const captionRel = material.video_url.replace(/^\/learning\/videos\/(.+)\.mp4$/, '/learning/captions/$1.vtt');
      return fs.existsSync(path.join(publicDir, material.image_url))
        && fs.existsSync(path.join(publicDir, material.video_url))
        && fs.existsSync(path.join(publicDir, captionRel));
    }), 'all starter guide images, videos, and caption files exist on disk');
    const materialId = materials.data.data[0].id;
    await request(`/materials/${materialId}/completion`, { actor: maria, method: 'PUT', body: { completed: true } });
    await request(`/materials/${materialId}/completion`, { actor: maria, method: 'PUT', body: { completed: true } });
    check(db.prepare('SELECT COUNT(*) count FROM quiz_material_completions WHERE material_id=? AND user_id=?').get(materialId, maria.id).count === 1, 'learning completion retries are idempotent');
    const material = materials.data.data[0];
    check((await request(`/materials/${materialId}`, { actor: admin, method: 'PUT', body: { ...material, image_url: 'https://untrusted.example/photo.png', is_published: true } })).status === 400, 'external arbitrary image URLs are rejected to match Content Security Policy');
    await request(`/materials/${materialId}`, { actor: admin, method: 'PUT', body: { ...material, title: 'Revised guide', is_published: true } });
    check(db.prepare('SELECT COUNT(*) count FROM quiz_material_completions WHERE material_id=?').get(materialId).count === 0, 'revised learning content resets the old completion record');
    const addedCategory = await request('/categories', { actor: admin, method: 'POST', body: { name: 'Custom curriculum', description: 'New topic' } });
    check((await request(`/categories/${addedCategory.data.data.id}`, { actor: admin, method: 'DELETE' })).status === 200 && (await request(`/categories/${category.id}`, { actor: admin, method: 'DELETE' })).status === 409, 'empty categories can be deleted while referenced categories are protected');
    for (const format of ['pdf', 'excel']) check((await request(`/reports/${format}`, { actor: admin })).status === 200 && (await request(`/reports/${format}`, { actor: teacher })).status === 403, `only administrators can export ${format} cohort reports`);
    check((await request('/reports/pdf', { actor: maria })).status === 403, 'students cannot export staff cohort reports');
    check([59.99, 60, 69.99, 70, 79.99, 80, 89.99, 90, 100].map(levelFor).join('|') === 'Needs Improvement|Beginner|Beginner|Developing|Developing|Proficient|Proficient|Advanced|Advanced', 'all percentage proficiency boundaries match the specification');
    check((await request('/research-results', { actor: maria })).data.data.every((row) => row.user_id === maria.id), 'research history remains separate and ownership filtered');

    const certQuiz = await request('/quizzes', { actor: admin, method: 'POST', body: { ...config, title: 'Certificate Lock Flow Quiz', question_ids: [ids[1]], assigned_user_ids: [juan.id], max_attempts: 2, pass_percentage: 80, status: 'published' } });
    const certQuizId = certQuiz.data.data.id;
    const beforeCerts = await request('/certificates', { actor: juan });
    const lockedBefore = beforeCerts.data.data.items.find((item) => item.instrument === 'knowledge' && item.assessment_id === certQuizId);
    check(beforeCerts.status === 200 && lockedBefore && lockedBefore.unlocked === false && lockedBefore.status === 'locked' && lockedBefore.download_url === null && lockedBefore.reference_code === null && lockedBefore.completion_status === 'not_started', 'unattempted assigned assessment shows as a locked certificate in My Certificates');

    const failAttempt = await request(`/quizzes/${certQuizId}/start`, { actor: juan, method: 'POST', body: { accepted_instructions: true } });
    const failAttemptId = failAttempt.data.data.attempt.id;
    const inProgressCerts = await request('/certificates', { actor: juan });
    const lockedInProgress = inProgressCerts.data.data.items.find((item) => item.instrument === 'knowledge' && item.assessment_id === certQuizId);
    check(lockedInProgress.unlocked === false && lockedInProgress.completion_status === 'in_progress' && lockedInProgress.download_url === null, 'in-progress assessments keep their certificate locked');

    await request(`/attempts/${failAttemptId}/answers`, { actor: juan, method: 'PUT', body: { responses: [{ question_id: ids[1], answer: 'true' }] } });
    await request(`/attempts/${failAttemptId}/submit`, { actor: juan, method: 'POST' });
    const belowCerts = await request('/certificates', { actor: juan });
    const lockedBelow = belowCerts.data.data.items.find((item) => item.instrument === 'knowledge' && item.assessment_id === certQuizId);
    check(lockedBelow.unlocked === false && lockedBelow.completion_status === 'below_threshold' && lockedBelow.download_url === null, 'completing an assessment below the threshold keeps the certificate locked');

    const passAttempt = await request(`/quizzes/${certQuizId}/start`, { actor: juan, method: 'POST', body: { accepted_instructions: true } });
    const passAttemptId = passAttempt.data.data.attempt.id;
    await request(`/attempts/${passAttemptId}/answers`, { actor: juan, method: 'PUT', body: { responses: [{ question_id: ids[1], answer: 'false' }] } });
    await request(`/attempts/${passAttemptId}/submit`, { actor: juan, method: 'POST' });

    const juanRelogin = session(db.prepare("SELECT id FROM users WHERE email='juan.delacruz@example.com'").get());
    const unlockedCerts = await request('/certificates', { actor: juanRelogin });
    const unlockedItem = unlockedCerts.data.data.items.find((item) => item.instrument === 'knowledge' && item.assessment_id === certQuizId);
    check(unlockedItem && unlockedItem.unlocked === true && unlockedItem.status === 'unlocked' && unlockedItem.attempt_id === passAttemptId && unlockedItem.reference_code === `MC-KQ-${String(passAttemptId).padStart(7, '0')}` && unlockedItem.download_url === `/knowledge/attempts/${passAttemptId}/export/certificate`, 'meeting the requirement unlocks the certificate in DB and persists across re-login');

    const unlockedPdf = await request(`/attempts/${passAttemptId}/export/certificate`, { actor: juanRelogin });
    check(unlockedPdf.status === 200 && unlockedPdf.data.subarray(0, 4).toString() === '%PDF', 'unlocked knowledge certificate exports a valid PDF');

    const extraResearchId = db.prepare("INSERT INTO assessments(title,description,created_by,status,max_attempts) VALUES('Research Lock Flow Survey','Certificate lock check',?,'active',1)").run(admin.id).lastInsertRowid;
    db.prepare('INSERT INTO assessment_assignments(assessment_id,user_id,assigned_by) VALUES(?,?,?)').run(extraResearchId, juan.id, admin.id);
    const lockedRes = (await request('/certificates', { actor: juanRelogin })).data.data.items.find((item) => item.instrument === 'research' && item.assessment_id === extraResearchId);
    check(lockedRes && lockedRes.unlocked === false && lockedRes.status === 'locked' && lockedRes.download_url === null && lockedRes.reference_code === null, 'incomplete assigned research assessments show a locked certificate until submitted');
    const completedResId = db.prepare("INSERT INTO assessment_attempts(assessment_id,user_id,status,started_at,completed_at,overall_mean,overall_level,scoring_version) VALUES(?,?,'completed',datetime('now','-5 minutes'),datetime('now'),3.5,'Very High','dlas-mean-1.0')").run(extraResearchId, juan.id).lastInsertRowid;
    const unlockedRes = (await request('/certificates', { actor: juanRelogin })).data.data.items.find((item) => item.instrument === 'research' && item.assessment_id === extraResearchId);
    check(unlockedRes && unlockedRes.unlocked === true && unlockedRes.status === 'unlocked' && unlockedRes.attempt_id === completedResId && unlockedRes.download_url === `/export/awards/${completedResId}/pdf`, 'completing an assigned research assessment unlocks its completion award in DB');

    console.log(`\nKnowledge checks: ${checks} passed, 0 failed`);
  } finally {
    await new Promise((resolve) => server.close(resolve)); db.close();
  }
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (process.env.DLAS_TEST_PARENT_CLEANUP === 'true' && process.send) { process.send({ cleanupDirectory: temporaryDirectory }); return; }
  if (global.gc) { global.gc(); await new Promise(setImmediate); }
  const resolved = path.resolve(temporaryDirectory);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected temporary test path.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
