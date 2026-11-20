// Temporary, isolated quiz-completion regressions. Never connects to study data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-quiz-completion-test-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DLAS_FREE_DEMO: 'false', PORT: '0',
  DLAS_DB_PATH: path.join(directory, 'completion.sqlite'),
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
});
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'BACKUP_STRATEGY', 'BACKUP_ENCRYPTION_KEY', 'DLAS_RESEARCH_ENABLED', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_HOST', 'MAIL_USER', 'MAIL_USERNAME', 'MAIL_PASS', 'MAIL_PASSWORD', 'BREVO_API_KEY', 'RESEND_API_KEY']) process.env[key] = '';
const { startServer } = require('./server');
const { db } = require('./db/database');
const { initializeQuizCompletion } = require('./db/quizCompletion');
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed++; console.log('  PASS ' + message); };

function actor(email, role = 'respondent') {
  const id = Number(db.prepare('INSERT INTO users(email,password,first_name,last_name,role,status,email_verified,is_demo,mfa_enabled) VALUES(?,?,?,?,?,?,1,0,?)')
    .run(email, 'isolated-fixture-only', 'Completion', role, role, 'active', role === 'respondent' ? 0 : 1).lastInsertRowid);
  const sid = crypto.randomUUID(), csrf = crypto.randomBytes(20).toString('hex');
  db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at,mfa_verified) VALUES(?,?,?,1)')
    .run(sid, id, new Date(Date.now() + 3600000).toISOString());
  return { id, csrf, cookie: 'dlas_session=' + jwt.sign({ id, jti: sid }, process.env.JWT_SECRET, { expiresIn: '1h' }) + '; dlas_csrf=' + csrf };
}

async function run() {
  const server = startServer(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/knowledge';
  const request = async (route, user, method = 'GET', body) => {
    const response = await fetch(base + route, {
      method, headers: { ...(user ? { Cookie: user.cookie, 'X-CSRF-Token': user.csrf } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, data: await response.json() };
  };
  const attemptRow = attemptId => db.prepare('SELECT * FROM quiz_attempts WHERE id=?').get(attemptId);
  const categoryResultCount = attemptId => db.prepare('SELECT COUNT(*) AS n FROM quiz_category_results WHERE attempt_id=?').get(attemptId).n;
  try {
    const admin = actor('completion-admin@example.test', 'admin');
    const interrupted = actor('completion-interrupted@example.test');
    const normal = actor('completion-normal@example.test');
    const unrelated = actor('completion-unrelated@example.test');
    const teacher = actor('completion-teacher@example.test', 'assessor');
    const category = db.prepare('SELECT id FROM quiz_categories ORDER BY id LIMIT 1').get().id;
    const questionBodies = [
      { prompt: 'Completion fixture: select the first option.', type: 'multiple_choice', options: ['First option', 'Second option'], correct_answer: '0' },
      { prompt: 'Completion fixture: this statement is true.', type: 'true_false', correct_answer: 'true' },
      { prompt: 'Completion fixture: type the word example.', type: 'identification', accepted_answers: ['example'] },
    ];
    const questionIds = [];
    for (const question of questionBodies) {
      const created = await request('/questions', admin, 'POST', { ...question, category_id: category, points: 1, explanation: 'Synthetic fixture answer for completion regression checks.' });
      assert.equal(created.status, 200);
      questionIds.push(Number(created.data.data.id));
    }
    const configuration = { title: 'Completion fixture baseline', description: 'Temporary baseline for interrupted-attempt checks.',
      instructions: 'Complete the synthetic fixture independently.', question_ids: questionIds, assign_all: true,
      status: 'published', max_attempts: 1, pass_percentage: 80, randomize: true, time_limit_minutes: 15 };
    const baseline = await request('/quizzes', admin, 'POST', configuration);
    assert.equal(baseline.status, 201);
    const baselineId = Number(baseline.data.data.id);
    const followup = await request('/quizzes', admin, 'POST', { ...configuration, title: 'Completion fixture follow-up' });
    assert.equal(followup.status, 201);
    const followupId = Number(followup.data.data.id);
    db.prepare("UPDATE knowledge_quizzes SET program_code='completion-fixture',stage='baseline' WHERE id=?").run(baselineId);
    db.prepare("UPDATE knowledge_quizzes SET program_code='completion-fixture',stage='follow_up',prerequisite_quiz_id=? WHERE id=?").run(baselineId, followupId);
    check((await request('/quizzes', null)).status === 401, 'assessment status requires an authenticated account');
    check((await request('/quizzes/' + followupId + '/start', interrupted, 'POST', { accepted_instructions: true })).status === 409,
      'follow-up is locked until the student finishes the prerequisite');

    const started = await request('/quizzes/' + baselineId + '/start', interrupted, 'POST', { accepted_instructions: true });
    assert.equal(started.status, 200);
    const attemptId = Number(started.data.data.attempt.id);
    const original = attemptRow(attemptId);
    const snapshot = JSON.parse(original.snapshot_json);
    const firstAnswer = { question_id: snapshot.questions[0].id, answer: snapshot.questions[0].answers[0] };
    const saved = await request('/attempts/' + attemptId + '/answers', interrupted, 'PUT', { expected_revision: 0, responses: [firstAnswer] });
    assert.equal(saved.status, 200);
    const resumed = await request('/quizzes/' + baselineId + '/start', interrupted, 'POST', { accepted_instructions: true });
    check(resumed.status === 200 && resumed.data.data.attempt.id === attemptId && resumed.data.data.attempt.status === 'in_progress'
      && resumed.data.data.attempt.deadline === original.deadline
      && JSON.stringify(resumed.data.data.snapshot.questions) === JSON.stringify(started.data.data.snapshot.questions)
      && JSON.stringify(resumed.data.data.responses) === JSON.stringify([firstAnswer]),
    'returning before expiry restores the same unfinished attempt, answers, order and deadline');
    const beforeActiveRead = attemptRow(attemptId);
    const activeRead = await request('/attempts/' + attemptId, interrupted);
    const activeList = (await request('/quizzes', interrupted)).data.data.find(quiz => quiz.id === baselineId);
    const activeOverview = await request('/overview', interrupted);
    check(activeList.latest_status === 'in_progress' && activeList.latest_completion_reason === null && activeList.latest_answered_count === 1
      && activeList.latest_deadline === original.deadline && activeList.attempt_count === 1,
    'the assessment list exposes an unfinished attempt without calling it completed or consuming a second attempt');
    check(activeRead.status === 200 && activeRead.data.data.results === null && activeRead.data.data.expired === false
      && activeOverview.data.data.summary.completed === 0 && activeOverview.data.data.summary.expired === 0
      && JSON.stringify(attemptRow(attemptId)) === JSON.stringify(beforeActiveRead),
    'pre-expiry reads and dashboard checks do not submit, score or otherwise mutate unfinished work');
    check((await request('/attempts/' + attemptId + '/submit', interrupted, 'POST', {})).status === 400
      && attemptRow(attemptId).status === 'in_progress' && categoryResultCount(attemptId) === 0,
    'an incomplete attempt cannot be submitted or scored before its deadline');
    for (const [route, method, body] of [
      ['/attempts/' + attemptId, 'GET'],
      ['/attempts/' + attemptId + '/answers', 'PUT', { expected_revision: 1, responses: [] }],
      ['/attempts/' + attemptId + '/submit', 'POST', {}],
    ]) assert.equal((await request(route, unrelated, method, body)).status, 403);
    check((await request('/attempts/' + attemptId, teacher)).status === 403,
      'other students and unrelated teachers cannot view, submit or modify the interrupted attempt');

    const endedAt = new Date(Date.now() - 60000).toISOString();
    db.prepare('UPDATE quiz_attempts SET deadline=? WHERE id=?').run(endedAt, attemptId);
    const beforeRead = attemptRow(attemptId);
    const expiredRead = await request('/attempts/' + attemptId, interrupted);
    const expiredList = (await request('/quizzes', interrupted)).data.data.find(quiz => quiz.id === baselineId);
    const expiredOverview = (await request('/overview', interrupted)).data.data;
    check(expiredRead.status === 200 && expiredRead.data.data.expired === true && expiredRead.data.data.results === null
      && expiredList.latest_status === 'in_progress' && expiredList.latest_deadline === endedAt
      && expiredList.latest_answered_count === 1 && expiredList.latest_completion_reason === null
      && JSON.stringify(attemptRow(attemptId)) === JSON.stringify(beforeRead) && categoryResultCount(attemptId) === 0,
    'reading an expired attempt or its list never silently submits, scores or changes the saved record');
    check(expiredOverview.summary.expired === 1 && expiredOverview.summary.completed === 0
      && expiredOverview.summary.pending === activeOverview.data.data.summary.pending - 1,
    'the dashboard recognizes an expired ongoing attempt without requiring finalization or miscounting it as pending');
    const resumedExpired = await request('/quizzes/' + baselineId + '/start', interrupted, 'POST', { accepted_instructions: true });
    check(resumedExpired.status === 200 && resumedExpired.data.data.attempt.id === attemptId
      && resumedExpired.data.data.expired === true && resumedExpired.data.data.attempt.deadline === endedAt,
    'reopening an expired attempt preserves the original deadline and does not grant extra time');
    check((await request('/attempts/' + attemptId + '/answers', interrupted, 'PUT', { expected_revision: 1,
      responses: snapshot.questions.map(question => ({ question_id: question.id, answer: question.answers[0] })) })).status === 410
      && db.prepare('SELECT COUNT(*) AS n FROM quiz_responses WHERE attempt_id=?').get(attemptId).n === 1,
    'late responses are rejected without overwriting answers received before expiry');

    const finalized = await request('/attempts/' + attemptId + '/submit', interrupted, 'POST', { completion_reason: 'submitted' });
    check(finalized.status === 200 && finalized.data.data.attempt.completion_reason === 'time_expired'
      && finalized.data.data.attempt.status === 'completed' && finalized.data.data.results.percentage === 33.33
      && finalized.data.data.results.questions.filter(question => question.answer).length === 1,
    'the server records time expiry separately from student completion and retains the actual partial score');
    const finishedRow = attemptRow(attemptId);
    const repeated = await request('/attempts/' + attemptId + '/submit', interrupted, 'POST', {});
    check(repeated.status === 200 && repeated.data.data.attempt.completion_reason === 'time_expired'
      && JSON.stringify(attemptRow(attemptId)) === JSON.stringify(finishedRow) && categoryResultCount(attemptId) === 1,
    'repeat finalization is idempotent and cannot rewrite the reason, timestamp, score or category result');
    const overview = (await request('/overview', interrupted)).data.data;
    const history = overview.history.find(row => row.id === attemptId);
    check(overview.summary.completed === 0 && overview.summary.expired === 1
      && history.completion_reason === 'time_expired' && history.answered_count === 1 && history.question_count === 3
      && history.percentage === 33.33 && overview.summary.average === 33.33 && overview.programComparisons.length === 0,
    'timed-out scores remain in history and analytics while the completed counter excludes them');
    const endedList = (await request('/quizzes', interrupted)).data.data.find(quiz => quiz.id === baselineId);
    check(endedList.latest_completion_reason === 'time_expired' && endedList.latest_answered_count === 1
      && endedList.latest_deadline === endedAt && endedList.attempt_count === 1,
    'the list reports the timeout reason and saved-answer count after finalization');
    check((await request('/quizzes/' + followupId + '/start', interrupted, 'POST', { accepted_instructions: true })).status === 409
      && !(await request('/quizzes', interrupted)).data.data.find(quiz => quiz.id === followupId).prerequisite_completed,
    'a timed-out incomplete baseline never unlocks the follow-up');
    check((await request('/quizzes/' + baselineId + '/start', interrupted, 'POST', { accepted_instructions: true })).status === 409
      && db.prepare('SELECT COUNT(*) AS n FROM quiz_attempts WHERE user_id=? AND quiz_id=?').get(interrupted.id, baselineId).n === 1,
    'timeout handling preserves the configured attempt limit without free retries or reopened timers');
    check((await request('/attempts/' + attemptId, unrelated)).status === 403
      && (await request('/overview', unrelated)).data.data.history.length === 0,
    'the timeout result and history remain private to the student and authorized staff');

    const normalStart = await request('/quizzes/' + baselineId + '/start', normal, 'POST', { accepted_instructions: true });
    assert.equal(normalStart.status, 200);
    const normalId = Number(normalStart.data.data.attempt.id);
    const normalSnapshot = JSON.parse(attemptRow(normalId).snapshot_json);
    const allAnswers = normalSnapshot.questions.map(question => ({ question_id: question.id, answer: question.answers[0] }));
    assert.equal((await request('/attempts/' + normalId + '/answers', normal, 'PUT', { expected_revision: 0, responses: allAnswers })).status, 200);
    const submitted = await request('/attempts/' + normalId + '/submit', normal, 'POST', { completion_reason: 'time_expired' });
    check(submitted.status === 200 && submitted.data.data.attempt.completion_reason === 'submitted'
      && submitted.data.data.attempt.status === 'completed' && submitted.data.data.results.percentage === 100
      && submitted.data.data.attempt.certificate_earned === 1,
    'a full on-time submission records student completion and keeps normal scoring and certificate behavior');
    const normalOverview = (await request('/overview', normal)).data.data;
    check(normalOverview.summary.completed === 1 && normalOverview.summary.expired === 0
      && normalOverview.history[0].completion_reason === 'submitted'
      && normalOverview.history[0].answered_count === 3 && normalOverview.history[0].question_count === 3,
    'a normally completed assessment appears in the completed count with full answer coverage');
    check((await request('/quizzes/' + followupId + '/start', normal, 'POST', { accepted_instructions: true })).status === 200,
      'a fully submitted baseline still unlocks its follow-up');
    const global = (await request('/overview', admin)).data.data;
    check(global.summary.completed === 1 && global.summary.expired === 1
      && global.history.some(row => row.id === attemptId && row.completion_reason === 'time_expired')
      && global.history.some(row => row.id === normalId && row.completion_reason === 'submitted'),
    'administrator reports retain both result types and distinguish expiry from student completion');
    const completeTimeoutStart = await request('/quizzes/' + baselineId + '/start', unrelated, 'POST', { accepted_instructions: true });
    assert.equal(completeTimeoutStart.status, 200);
    const completeTimeoutId = completeTimeoutStart.data.data.attempt.id;
    const completeTimeoutSnapshot = JSON.parse(attemptRow(completeTimeoutId).snapshot_json);
    assert.equal((await request('/attempts/' + completeTimeoutId + '/answers', unrelated, 'PUT', { expected_revision: 0,
      responses: completeTimeoutSnapshot.questions.map(question => ({ question_id: question.id, answer: question.answers[0] })) })).status, 200);
    db.prepare('UPDATE quiz_attempts SET deadline=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), completeTimeoutId);
    const completeTimeout = await request('/attempts/' + completeTimeoutId + '/submit', unrelated, 'POST', {});
    check(completeTimeout.status === 200 && completeTimeout.data.data.attempt.completion_reason === 'time_expired'
      && completeTimeout.data.data.results.percentage === 100
      && (await request('/quizzes/' + followupId + '/start', unrelated, 'POST', { accepted_instructions: true })).status === 200,
    'a timeout with all answers received keeps its score and can satisfy the complete-response prerequisite');

    const stripReason = ({ completion_reason, ...row }) => row;
    const rowsBeforeMigration = db.prepare('SELECT * FROM quiz_attempts ORDER BY id').all().map(stripReason);
    const responsesBeforeMigration = db.prepare('SELECT * FROM quiz_responses ORDER BY attempt_id,question_id').all();
    const categoriesBeforeMigration = db.prepare('SELECT * FROM quiz_category_results ORDER BY attempt_id,category_id').all();
    db.prepare("UPDATE quiz_attempts SET completion_reason=NULL WHERE status='completed'").run();
    initializeQuizCompletion(db);
    check(attemptRow(attemptId).completion_reason === 'time_expired'
      && attemptRow(normalId).completion_reason === 'submitted'
      && attemptRow(completeTimeoutId).completion_reason === 'time_expired'
      && db.prepare("SELECT completion_reason FROM quiz_attempts WHERE status='in_progress' LIMIT 1").get().completion_reason === null,
    'legacy backfill distinguishes expired partial and full results from on-time submissions while leaving ongoing work unfinished');
    check(JSON.stringify(db.prepare('SELECT * FROM quiz_attempts ORDER BY id').all().map(stripReason)) === JSON.stringify(rowsBeforeMigration)
      && JSON.stringify(db.prepare('SELECT * FROM quiz_responses ORDER BY attempt_id,question_id').all()) === JSON.stringify(responsesBeforeMigration)
      && JSON.stringify(db.prepare('SELECT * FROM quiz_category_results ORDER BY attempt_id,category_id').all()) === JSON.stringify(categoriesBeforeMigration),
    'completion backfill preserves original scores, timestamps, snapshots, answers, identities and category results');
    const afterFirstMigration = JSON.stringify(db.prepare('SELECT * FROM quiz_attempts ORDER BY id').all());
    initializeQuizCompletion(db);
    check(JSON.stringify(db.prepare('SELECT * FROM quiz_attempts ORDER BY id').all()) === afterFirstMigration
      && db.prepare('PRAGMA table_info(quiz_attempts)').all().filter(column => column.name === 'completion_reason').length === 1,
    'rerunning the additive completion migration preserves all classified records without duplicate columns or results');

    const whitespaceStudent = actor('completion-whitespace@example.test');
    const whitespaceConfiguration = { ...configuration, question_ids: [questionIds[2]], assign_all: false,
      assigned_user_ids: [whitespaceStudent.id], title: 'Whitespace fixture baseline' };
    const whitespaceBaseline = await request('/quizzes', admin, 'POST', whitespaceConfiguration);
    assert.equal(whitespaceBaseline.status, 201);
    const whitespaceBaselineId = whitespaceBaseline.data.data.id;
    const whitespaceFollowup = await request('/quizzes', admin, 'POST', { ...whitespaceConfiguration, title: 'Whitespace fixture follow-up' });
    assert.equal(whitespaceFollowup.status, 201);
    const whitespaceFollowupId = whitespaceFollowup.data.data.id;
    db.prepare("UPDATE knowledge_quizzes SET program_code='whitespace-fixture',stage='baseline' WHERE id=?").run(whitespaceBaselineId);
    db.prepare("UPDATE knowledge_quizzes SET program_code='whitespace-fixture',stage='follow_up',prerequisite_quiz_id=? WHERE id=?")
      .run(whitespaceBaselineId, whitespaceFollowupId);
    const whitespaceStart = await request('/quizzes/' + whitespaceBaselineId + '/start', whitespaceStudent, 'POST', { accepted_instructions: true });
    assert.equal(whitespaceStart.status, 200);
    const whitespaceAttemptId = whitespaceStart.data.data.attempt.id;
    const blankAnswer = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
    assert.equal(blankAnswer.trim(), '');
    assert.equal((await request('/attempts/' + whitespaceAttemptId + '/answers', whitespaceStudent, 'PUT', {
      expected_revision: 0, responses: [{ question_id: questionIds[2], answer: blankAnswer }],
    })).status, 200);
    const whitespaceBeforeExpiry = (await request('/quizzes', whitespaceStudent)).data.data.find(quiz => quiz.id === whitespaceBaselineId);
    assert.equal(whitespaceBeforeExpiry.latest_answered_count, 0, 'Unicode whitespace must not count as a provided identification answer');
    assert.equal((await request('/attempts/' + whitespaceAttemptId + '/submit', whitespaceStudent, 'POST', {})).status, 400);
    db.prepare('UPDATE quiz_attempts SET deadline=? WHERE id=?').run(new Date(Date.now() - 1000).toISOString(), whitespaceAttemptId);
    const whitespaceFinal = await request('/attempts/' + whitespaceAttemptId + '/submit', whitespaceStudent, 'POST', {});
    const whitespaceHistory = (await request('/overview', whitespaceStudent)).data.data.history.find(row => row.id === whitespaceAttemptId);
    const whitespaceList = (await request('/quizzes', whitespaceStudent)).data.data;
    check(whitespaceFinal.status === 200 && whitespaceFinal.data.data.attempt.completion_reason === 'time_expired'
      && whitespaceFinal.data.data.results.percentage === 0 && whitespaceHistory.answered_count === 0
      && whitespaceHistory.question_count === 1 && whitespaceHistory.percentage === 0
      && whitespaceList.find(quiz => quiz.id === whitespaceBaselineId).latest_answered_count === 0
      && !whitespaceList.find(quiz => quiz.id === whitespaceFollowupId).prerequisite_completed
      && (await request('/quizzes/' + whitespaceFollowupId + '/start', whitespaceStudent, 'POST', { accepted_instructions: true })).status === 409
      && db.prepare('SELECT answer FROM quiz_responses WHERE attempt_id=? AND question_id=?').get(whitespaceAttemptId, questionIds[2]).answer === blankAnswer,
    'tabs, newlines and Unicode-only whitespace remain saved but never count as answered or unlock a follow-up after expiry');

    const archive = await request('/quizzes', admin, 'POST', {
      ...configuration, question_ids: [questionIds[2]], title: 'Archive with work in progress',
    });
    assert.equal(archive.status, 201);
    const archivePath = '/quizzes/' + archive.data.data.id;
    const archiveFirst = await request(archivePath + '/start', normal, 'POST', { accepted_instructions: true });
    const archiveSecond = await request(archivePath + '/start', interrupted, 'POST', { accepted_instructions: true });
    assert.equal(archiveFirst.status, 200);
    assert.equal(archiveSecond.status, 200);
    const firstPath = '/attempts/' + archiveFirst.data.data.attempt.id;
    const secondPath = '/attempts/' + archiveSecond.data.data.attempt.id;
    const archiveAnswer = { expected_revision: 0, responses: [{ question_id: questionIds[2], answer: 'example' }] };
    assert.equal((await request(firstPath + '/answers', normal, 'PUT', archiveAnswer)).status, 200);
    assert.equal((await request(firstPath + '/submit', normal, 'POST', {})).status, 200);
    assert.equal((await request(archivePath + '/status', admin, 'PUT', { status: 'archived' })).status, 200);

    const archivedReview = await request(firstPath, normal);
    check(archivedReview.data.data.answer_key_released === false
      && archivedReview.data.data.results.percentage === 100
      && (await request('/overview', normal)).data.data.history.some(row => row.id === archiveFirst.data.data.attempt.id),
    'archiving preserves the saved result and keeps detailed review locked while another attempt is open');
    const archivedResume = await request(archivePath + '/start', interrupted, 'POST', {});
    check(archivedResume.status === 200 && archivedResume.data.data.attempt.id === archiveSecond.data.data.attempt.id
      && archivedResume.data.data.attempt.deadline === archiveSecond.data.data.attempt.deadline
      && (await request(archivePath + '/start', unrelated, 'POST', { accepted_instructions: true })).status === 409,
    'an archived assessment lets an existing attempt resume with its original deadline and closes new starts');
    assert.equal((await request(secondPath + '/answers', interrupted, 'PUT', archiveAnswer)).status, 200);
    const archivedCompletion = await request(secondPath + '/submit', interrupted, 'POST', {});
    check(archivedCompletion.status === 200 && archivedCompletion.data.data.results.percentage === 100
      && (await request(firstPath, normal)).data.data.answer_key_released === true,
    'the last open attempt can finish and detailed review becomes available afterward');

    console.log('Quiz-completion checks: ' + passed + ' passed, 0 failed');
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (process.env.DLAS_TEST_PARENT_CLEANUP === 'true' && process.send) { process.send({ cleanupDirectory: directory }); return; }
  if (global.gc) { global.gc(); await new Promise(setImmediate); }
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('dlas-quiz-completion-test-')) throw new Error('Unexpected completion-test cleanup directory.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
