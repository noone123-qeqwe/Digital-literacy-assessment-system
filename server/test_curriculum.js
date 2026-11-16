const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const jwt = require('jsonwebtoken');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-curriculum-test-'));
process.env.NODE_ENV = 'test'; process.env.DLAS_FREE_DEMO = 'false'; process.env.PORT = '0';
process.env.DLAS_DB_PATH = path.join(temporaryDirectory, 'curriculum.sqlite'); process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'BACKUP_STRATEGY', 'BACKUP_ENCRYPTION_KEY', 'DLAS_RESEARCH_ENABLED', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_HOST', 'MAIL_USER', 'MAIL_USERNAME', 'MAIL_PASS', 'MAIL_PASSWORD', 'BREVO_API_KEY', 'RESEND_API_KEY']) process.env[key] = '';
const { startServer } = require('./server');
const { db } = require('./db/database');
const { categoryNames, validateCourse, publishFoundationCurriculum } = require('./db/foundationCurriculum');
let passed = 0;
const check = (condition, message) => { assert.ok(condition, message); passed++; console.log(`  PASS ${message}`); };

function fixtureCourse() {
  const phase = (name, category) => [
    { objective: 'select_first', prompt: `Fixture ${category} ${name}: choose the first option.`, type: 'multiple_choice', options: ['first', 'second', 'third', 'fourth'], correct_answer: '0', explanation: 'The fixture explicitly asks for the first option.' },
    { objective: 'select_second', prompt: `Fixture ${category} ${name}: choose the second option.`, type: 'multiple_choice', options: ['first', 'second', 'third', 'fourth'], correct_answer: '1', explanation: 'The fixture explicitly asks for the second option.' },
    { objective: 'read_statement', prompt: `Fixture ${category} ${name}: this statement is true.`, type: 'true_false', correct_answer: 'true', explanation: 'This is a synthetic true statement used only in an isolated test.' },
    { objective: 'type_word', prompt: `Fixture ${category} ${name}: enter the word sample.`, type: 'identification', accepted_answers: ['sample'], explanation: 'This fixture checks the typed answer without using real course keys.' },
  ];
  return { version: 'fixture-course-1.0', programCode: 'fixture-foundations-v1', sources: { fixture: { title: 'Synthetic test reference', url: 'https://example.test/reference' } }, categories: categoryNames.map((name, i) => ({ name, baseline: phase('baseline', i), follow_up: phase('follow-up', i) })) };
}
function addUser(email, role = 'respondent', verified = 1, status = 'active') {
  const id = db.prepare('INSERT INTO users(email,password,first_name,last_name,role,status,email_verified,is_demo,mfa_enabled) VALUES(?,?,?,?,?,?,?,0,?)').run(email, 'isolated-test-only', 'Fixture', role, role, status, verified, role === 'respondent' ? 0 : 1).lastInsertRowid;
  const sid = crypto.randomUUID(); db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at,mfa_verified) VALUES(?,?,?,1)').run(sid, id, new Date(Date.now() + 3600000).toISOString());
  const csrf = crypto.randomBytes(20).toString('hex');
  return { id: Number(id), cookies: `dlas_session=${jwt.sign({ id: Number(id), jti: sid }, process.env.JWT_SECRET, { expiresIn: '1h' })}; dlas_csrf=${csrf}`, csrf };
}
async function run() {
  const server = startServer(0); await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route, actor, method = 'GET', body) => {
    const r = await fetch(base + route, { method, headers: { ...(actor ? { Cookie: actor.cookies, 'X-CSRF-Token': actor.csrf } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, data: r.headers.get('content-type')?.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
  try {
    const course = process.env.DLAS_PRIVATE_CONTENT_FILE ? JSON.parse(fs.readFileSync(process.env.DLAS_PRIVATE_CONTENT_FILE, 'utf8')) : fixtureCourse();
    const forms = validateCourse(course);
    check(forms.length === 2 && forms.every(f => f.questions.length === 32 && f.questions.reduce((s, q) => s + q.points, 0) === 32), 'both course forms contain 32 equally weighted questions across eight categories');
    const broken = structuredClone(course); broken.categories[0].follow_up[0].objective = 'unmatched_objective';
    assert.throws(() => validateCourse(broken)); check(true, 'unmatched baseline and follow-up objectives are rejected');
    const admin = addUser('admin@example.test', 'admin'); const student = addUser('student@example.test'); const pending = addUser('pending@example.test', 'respondent', 0); const inactive = addUser('inactive@example.test', 'respondent', 1, 'inactive'); const teacher = addUser('teacher@example.test', 'assessor');
    const researchCount = db.prepare('SELECT COUNT(*) AS count FROM assessment_attempts').get().count;
    const manifest = publishFoundationCurriculum(db, course, admin.id); const baselineId = manifest.quizIds.baseline, followupId = manifest.quizIds.follow_up;
    check(db.prepare('SELECT COUNT(*) AS count FROM quiz_questions').get().count === 64 && db.prepare('SELECT COUNT(*) AS count FROM knowledge_quizzes').get().count === 2, 'publication creates 64 original bank entries and two published forms');
    const snapshots = db.prepare('SELECT * FROM knowledge_quizzes ORDER BY id').all();
    check(snapshots.every(q => q.status === 'published' && q.time_limit_minutes === 35 && q.max_attempts === 1 && q.pass_percentage === 80 && JSON.parse(q.snapshot_json).questions.length === 32), 'published instructions, attempt limits, timer and certificate threshold agree with saved settings');
    check(db.prepare('SELECT COUNT(*) AS count FROM quiz_assignments WHERE user_id=?').get(student.id).count === 2 && [pending, inactive, admin, teacher].every(u => db.prepare('SELECT COUNT(*) AS count FROM quiz_assignments WHERE user_id=?').get(u.id).count === 0), 'automatic enrollment includes only active verified students');
    const repeated = publishFoundationCurriculum(db, course, admin.id); check(repeated.alreadyPublished && db.prepare('SELECT COUNT(*) AS count FROM quiz_questions').get().count === 64, 'repeated publication creates no duplicates');
    const changed = structuredClone(course); changed.categories[0].baseline[0].prompt += ' Changed.';
    assert.throws(() => publishFoundationCurriculum(db, changed, admin.id), /new version/); check(true, 'changed published content requires a new version');
    check((await request(`/knowledge/quizzes/${followupId}/start`, student, 'POST', { accepted_instructions: true })).status === 409 && db.prepare('SELECT COUNT(*) AS count FROM quiz_attempts').get().count === 0, 'direct follow-up start is blocked until the same student completes baseline');
    check((await request(`/knowledge/quizzes/${baselineId}`, admin, 'DELETE')).status === 409, 'dependent baseline cannot be deleted underneath the follow-up');
    const token = crypto.randomBytes(32).toString('base64url'); db.prepare("INSERT INTO auth_tokens(user_id,token_hash,token_type,expires_at) VALUES(?,?,'email_verification',?)").run(pending.id, crypto.createHash('sha256').update(token).digest('hex'), new Date(Date.now() + 60000).toISOString());
    const verified = await request('/auth/verify-email', null, 'POST', { token });
    check(verified.status === 200 && db.prepare('SELECT COUNT(*) AS count FROM quiz_assignments WHERE user_id=?').get(pending.id).count === 2, 'email verification automatically enrolls a newly verified student');
    const start = await request(`/knowledge/quizzes/${baselineId}/start`, student, 'POST', { accepted_instructions: true });
    check(start.status === 200 && start.data.data.snapshot.questions.every(q => !('answers' in q) && !('explanation' in q)) && !('snapshot_json' in start.data.data.attempt), 'active baseline response never includes answer keys or explanations');
    const answerAttempt = async (data, correctCount) => {
      const saved = db.prepare('SELECT snapshot_json,answers_revision FROM quiz_attempts WHERE id=?').get(data.attempt.id); const snapshot = JSON.parse(saved.snapshot_json);
      const responses = snapshot.questions.map((q, i) => ({ question_id: q.id, answer: i < correctCount ? q.answers[0] : q.type === 'identification' ? 'intentionally incorrect fixture answer' : q.options.find(o => !q.answers.includes(o.id)).id }));
      const upload = await request(`/knowledge/attempts/${data.attempt.id}/answers`, student, 'PUT', { expected_revision: saved.answers_revision, responses }); assert.equal(upload.status, 200);
      return request(`/knowledge/attempts/${data.attempt.id}/submit`, student, 'POST');
    };
    const baseline = await answerAttempt(start.data.data, 25);
    check(baseline.status === 200 && baseline.data.data.results.percentage === 78.13 && baseline.data.data.attempt.certificate_earned === 0, '25 of 32 points records the baseline without awarding an 80-percent certificate');
    const followup = await request(`/knowledge/quizzes/${followupId}/start`, student, 'POST', { accepted_instructions: true });
    check(followup.status === 200 && !followup.data.data.snapshot.questions.some(q => start.data.data.snapshot.questions.some(old => old.id === q.id)), 'baseline completion unlocks a distinct follow-up even below the certificate threshold');
    const result = await answerAttempt(followup.data.data, 26);
    check(result.status === 200 && result.data.data.results.percentage === 81.25 && result.data.data.attempt.certificate_earned === 1 && result.data.data.results.categories.length === 8 && result.data.data.results.categories.every(c => c.possible === 4), '26 of 32 points earns a certificate with eight category results');
    const progress = await request('/knowledge/overview', student); const pair = progress.data.data.programComparisons[0];
    check(pair.baseline === 78.13 && pair.followup === 81.25 && pair.categories.length === 8 && pair.baseline_attempt_id !== pair.followup_attempt_id, 'progress pairs the baseline and follow-up without conflating them with retakes');
    check((await request('/knowledge/overview?user_id=' + student.id, pending)).data.data.programComparisons.length === 0 && (await request('/knowledge/overview', teacher)).data.data.programComparisons.length === 0, 'program progress respects student ownership and assessor cohort boundaries');
    check((await request(`/knowledge/quizzes/${baselineId}/start`, student, 'POST', { accepted_instructions: true })).status === 409, 'the published one-attempt baseline limit is enforced');
    await request(`/knowledge/quizzes/${followupId}/status`, admin, 'PUT', { status: 'draft' });
    publishFoundationCurriculum(db, course, admin.id);
    check(db.prepare('SELECT status FROM knowledge_quizzes WHERE id=?').get(followupId).status === 'draft', 'repeat import respects staff unpublication choices');
    check(db.prepare('SELECT COUNT(*) AS count FROM assessment_attempts').get().count === researchCount, 'course publication and submissions do not create research results');
    console.log(`\nCurriculum checks: ${passed} passed, 0 failed`);
  } finally { await new Promise(resolve => server.close(resolve)); db.close(); }
}
run().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(async () => {
  if (process.env.DLAS_TEST_PARENT_CLEANUP === 'true' && process.send) { process.send({ cleanupDirectory: temporaryDirectory }); return; }
  if (global.gc) { global.gc(); await new Promise(setImmediate); }
  const resolved = path.resolve(temporaryDirectory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('dlas-curriculum-test-')) throw new Error('Unexpected test cleanup location.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
