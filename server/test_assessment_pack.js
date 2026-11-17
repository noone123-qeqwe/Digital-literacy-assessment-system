const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const jwt = require('jsonwebtoken');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-pack-test-'));
process.env.NODE_ENV = 'test'; process.env.DLAS_FREE_DEMO = 'false'; process.env.PORT = '0';
process.env.DLAS_DB_PATH = path.join(directory, 'pack.sqlite');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'BACKUP_STRATEGY', 'BACKUP_ENCRYPTION_KEY', 'DLAS_RESEARCH_ENABLED', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_HOST', 'MAIL_USER', 'MAIL_USERNAME', 'MAIL_PASS', 'MAIL_PASSWORD', 'BREVO_API_KEY', 'RESEND_API_KEY']) process.env[key] = '';
const { startServer } = require('./server');
const { db } = require('./db/database');
const { validateAssessmentPack, publishAssessmentPack } = require('./db/assessmentPack');
const { enrollPublishedQuizzes } = require('./utils/quizEnrollment');
const { scoreSnapshot } = require('./utils/knowledgeQuiz');
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed++; console.log('  PASS ' + message); };
function fixturePack() {
  return { version: 'fixture-topic-pack-v1', sources: { fixture: { title: 'Synthetic fixture reference', url: 'https://example.test/standard' } },
    quizzes: Array.from({ length: 6 }, (_, quiz) => ({
      key: 'fixture-topic-' + quiz, title: 'Fixture topic assessment ' + quiz, format: quiz % 2 ? 'scenario' : 'knowledge_check',
      description: 'Original synthetic questions used only in isolated assessment publication checks.', minutes: 15, certificatePercentage: 80,
      questions: Array.from({ length: 12 }, (_, i) => {
        const common = { category: i % 2 ? 'Internet Literacy' : 'Computer Literacy', source: 'fixture',
          prompt: 'Fixture topic ' + quiz + ', item ' + i + ': ' , explanation: 'This synthetic item checks the declared fixture answer without using live question keys.' };
        return i < 8 ? { ...common, prompt: common.prompt + 'select the first option.', type: 'multiple_choice', options: ['first', 'second', 'third', 'fourth'], correct_answer: '0' }
          : i < 10 ? { ...common, prompt: common.prompt + 'this statement is true.', type: 'true_false', correct_answer: 'true' }
            : { ...common, prompt: common.prompt + 'enter the term example.', type: 'identification', accepted_answers: ['example', 'sample term'] };
      }),
    })) };
}
function actor(email, role = 'respondent', verified = 1, status = 'active', demo = 0) {
  const id = Number(db.prepare('INSERT INTO users(email,password,first_name,last_name,role,status,email_verified,is_demo) VALUES(?,?,?,?,?,?,?,?)')
    .run(email, 'isolated-only', 'Fixture', 'Account', role, status, verified, demo).lastInsertRowid);
  const session = crypto.randomUUID(), csrf = crypto.randomBytes(20).toString('hex');
  db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at,mfa_verified) VALUES(?,?,?,1)').run(session, id, new Date(Date.now() + 3600000).toISOString());
  return { id, csrf, cookie: 'dlas_session=' + jwt.sign({ id, jti: session }, process.env.JWT_SECRET, { expiresIn: '1h' }) + '; dlas_csrf=' + csrf };
}
async function run() {
  const server = startServer(0); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const request = async (route, user, method = 'GET', body) => {
    const response = await fetch(base + route, { method, headers: { ...(user ? { Cookie: user.cookie, 'X-CSRF-Token': user.csrf } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, data: response.headers.get('content-type')?.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer()) };
  };
  try {
    const pack = process.env.DLAS_PRIVATE_ASSESSMENT_FILE ? JSON.parse(fs.readFileSync(process.env.DLAS_PRIVATE_ASSESSMENT_FILE, 'utf8')) : fixturePack();
    const prepared = validateAssessmentPack(pack);
    check(prepared.length === 6 && prepared.every(q => q.questions.length === 12 && q.questions.reduce((n, i) => n + i.points, 0) === 12), 'six complete assessments have twelve equally weighted questions each');
    for (const mutation of [
      p => { p.quizzes[0].questions[0].source = 'missing'; },
      p => { p.quizzes[0].questions[0].source = '__proto__'; },
      p => { p.quizzes[0].questions[0].category = 'Unknown category'; },
      p => { p.quizzes[0].questions[0].correct_answer = '999'; },
      p => { p.quizzes[0].questions[0].explanation = ''; },
      p => { p.quizzes[1].questions[0].prompt = p.quizzes[0].questions[0].prompt; },
      p => { p.sources[Object.keys(p.sources)[0]].url = 'http://example.test/insecure'; },
    ]) {
      const invalid = structuredClone(pack); mutation(invalid); assert.throws(() => validateAssessmentPack(invalid));
    }
    check(true, 'invalid keys, categories, sources, references, explanations and duplicate prompts are rejected');
    const admin = actor('pack-admin@example.test', 'admin', 1, 'active', 1);
    const student = actor('pack-student@example.test');
    const pending = actor('pack-pending@example.test', 'respondent', 0);
    const inactive = actor('pack-inactive@example.test', 'respondent', 1, 'inactive');
    const other = actor('pack-other@example.test');
    const badAdmin = actor('pack-unverified-admin@example.test', 'admin', 0);
    assert.throws(() => publishAssessmentPack(db, pack, student.id));
    assert.throws(() => publishAssessmentPack(db, pack, badAdmin.id));
    check(true, 'publication requires an active verified administrator');
    const beforeResearch = db.prepare('SELECT COUNT(*) AS n FROM assessment_attempts').get().n;
    const manifest = publishAssessmentPack(db, pack, admin.id);
    check(manifest.assessments.length === 6 && manifest.questions === 72, 'publication creates six assessments and seventy-two bank entries');
    check(db.prepare('SELECT COUNT(*) AS n FROM quiz_assignments WHERE user_id=?').get(student.id).n === 6
      && db.prepare('SELECT COUNT(*) AS n FROM quiz_assignments WHERE user_id IN (?,?)').get(pending.id, inactive.id).n === 0,
    'only active verified students receive automatic assignments');
    const count = db.prepare('SELECT COUNT(*) AS n FROM quiz_questions').get().n;
    check(publishAssessmentPack(db, pack, admin.id).alreadyPublished && db.prepare('SELECT COUNT(*) AS n FROM quiz_questions').get().n === count,
      'repeating the same import creates no duplicate questions or assessments');
    const changed = structuredClone(pack); changed.quizzes[0].questions[0].prompt += ' changed';
    assert.throws(() => publishAssessmentPack(db, changed, admin.id));
    check(true, 'published versions cannot silently change their question or scoring content');
    const quizId = manifest.assessments[0].id;
    db.prepare("UPDATE knowledge_quizzes SET status='archived' WHERE id=?").run(quizId);
    publishAssessmentPack(db, pack, admin.id);
    check(db.prepare('SELECT status FROM knowledge_quizzes WHERE id=?').get(quizId).status === 'archived', 're-import respects an administrator archival decision');
    db.prepare("UPDATE knowledge_quizzes SET status='published' WHERE id=?").run(quizId);
    const future = actor('future-student@example.test');
    enrollPublishedQuizzes(db, future.id);
    check(db.prepare('SELECT COUNT(*) AS n FROM quiz_assignments WHERE user_id=?').get(future.id).n === 6, 'future verified students can receive the published pack');
    check((await request('/knowledge/questions', student)).status === 403, 'students cannot read the private question bank');
    check((await request('/knowledge/quizzes/' + quizId + '/start', student, 'POST', {})).status === 400, 'independent-work instructions must be accepted before starting');
    const started = await request('/knowledge/quizzes/' + quizId + '/start', student, 'POST', { accepted_instructions: true });
    const attempt = started.data.data.attempt, visible = started.data.data.snapshot;
    check(started.status === 200 && visible.questions.length === 12 && !JSON.stringify(visible).includes('"answers":')
      && !JSON.stringify(visible).includes('"explanation":'), 'student attempts contain questions and options without answer keys or explanations');
    check((await request('/knowledge/attempts/' + attempt.id, other)).status === 403, 'another verified student cannot read this student’s attempt');
    const resumed = await request('/knowledge/quizzes/' + quizId + '/start', student, 'POST', { accepted_instructions: true });
    check(resumed.data.data.attempt.id === attempt.id && JSON.stringify(resumed.data.data.snapshot.questions) === JSON.stringify(visible.questions),
      'resuming keeps the same attempt and randomized order');
    const snapshot = JSON.parse(db.prepare('SELECT snapshot_json FROM quiz_attempts WHERE id=?').get(attempt.id).snapshot_json);
    const responses = snapshot.questions.map(q => ({ question_id: q.id, answer: q.type === 'identification' ? '  ' + q.answers[0].toUpperCase() + '  ' : q.answers[0] }));
    const saved = await request('/knowledge/attempts/' + attempt.id + '/answers', student, 'PUT', { expected_revision: 0, responses });
    const submitted = await request('/knowledge/attempts/' + attempt.id + '/submit', student, 'POST', {});
    check(saved.status === 200 && submitted.status === 200 && submitted.data.data.results.percentage === 100
      && submitted.data.data.attempt.certificate_earned === 1, 'the real answer/save/submit flow scores all three formats and awards the quiz certificate');
    const certificate = await request('/knowledge/attempts/' + attempt.id + '/export/certificate', student);
    check(certificate.status === 200 && certificate.data.subarray(0, 4).toString() === '%PDF', 'earned achievement certificates can be downloaded as PDF');
    check((await request('/knowledge/quizzes/' + quizId + '/start', student, 'POST', { accepted_instructions: true })).status === 409, 'the published one-attempt limit is enforced');
    for (const quiz of db.prepare('SELECT snapshot_json FROM knowledge_quizzes').all()) {
      const data = JSON.parse(quiz.snapshot_json);
      const correct = data.questions.map(q => ({ question_id: q.id, answer: q.answers[0] }));
      const low = correct.map((a, i) => i < 3 ? { ...a, answer: '__incorrect_fixture__' } : a);
      const minimum = correct.map((a, i) => i < 2 ? { ...a, answer: '__incorrect_fixture__' } : a);
      check(scoreSnapshot(data, correct).percentage === 100 && scoreSnapshot(data, minimum).certificateEarned
        && !scoreSnapshot(data, low).certificateEarned, 'each published quiz awards a certificate at ten correct answers and withholds it at nine');
    }
    const rollback = structuredClone(pack); rollback.version += '-rollback';
    for (const q of rollback.quizzes) { q.title += ' rollback'; for (const item of q.questions) item.prompt += ' rollback'; }
    let insertions = 0;
    const faultDb = { transaction: db.transaction.bind(db), prepare(sql) {
      if (sql.startsWith('INSERT INTO knowledge_quizzes') && ++insertions === 2) throw new Error('Synthetic publication failure');
      return db.prepare(sql);
    } };
    const before = [db.prepare('SELECT COUNT(*) AS n FROM quiz_questions').get().n, db.prepare('SELECT COUNT(*) AS n FROM knowledge_quizzes').get().n, db.prepare('SELECT COUNT(*) AS n FROM quiz_assignments').get().n];
    assert.throws(() => publishAssessmentPack(faultDb, rollback, admin.id));
    check(JSON.stringify(before) === JSON.stringify([db.prepare('SELECT COUNT(*) AS n FROM quiz_questions').get().n, db.prepare('SELECT COUNT(*) AS n FROM knowledge_quizzes').get().n, db.prepare('SELECT COUNT(*) AS n FROM quiz_assignments').get().n]),
      'a failed multi-assessment publication rolls back all new rows');
    check(db.prepare('SELECT COUNT(*) AS n FROM assessment_attempts').get().n === beforeResearch, 'educational publication leaves research attempts untouched');
    console.log('Assessment-pack checks: ' + passed + ' passed, 0 failed');
  } finally {
    server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); db.close();
  }
}
run().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (process.env.DLAS_TEST_PARENT_CLEANUP === 'true' && process.send) { process.send({ cleanupDirectory: directory }); return; }
  if (global.gc) { global.gc(); await new Promise(setImmediate); }
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('dlas-pack-test-')) throw new Error('Unexpected fixture directory');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
