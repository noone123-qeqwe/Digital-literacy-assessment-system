// Account-scoped bookmark checks use a disposable local database, never study data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-bookmarks-test-'));
process.env.NODE_ENV = 'test';
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'BACKUP_STRATEGY', 'BACKUP_ENCRYPTION_KEY', 'DLAS_RESEARCH_ENABLED', 'SMTP_HOST', 'SMTP_FROM', 'SMTP_USER', 'SMTP_PASS', 'BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_HOST', 'MAIL_FROM', 'MAIL_FROM_ADDRESS', 'MAIL_USER', 'MAIL_USERNAME', 'MAIL_PASS', 'MAIL_PASSWORD']) process.env[key] = '';
Object.assign(process.env, { EMAIL_PROVIDER: 'smtp', DLAS_FREE_DEMO: 'false', DLAS_DB_PATH: path.join(temporaryDirectory, 'bookmarks.sqlite'), JWT_SECRET: crypto.randomBytes(32).toString('hex') });
const { startServer } = require('./server');
const { db, initializeDatabase } = require('./db/database');
const { seed } = require('./db/seed');
let checks = 0;
function check(condition, message) { assert.ok(condition, message); checks++; console.log(`  PASS ${message}`); }
function session(user) {
  const sid = crypto.randomUUID(), csrf = crypto.randomBytes(24).toString('hex');
  db.prepare("UPDATE users SET email_verified=1,mfa_enabled=CASE WHEN role='respondent' THEN 0 ELSE 1 END WHERE id=?").run(user.id);
  db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at,mfa_verified) VALUES(?,?,?,1)').run(sid, user.id, new Date(Date.now() + 3600000).toISOString());
  return { id: user.id, csrf, cookie: `dlas_session=${jwt.sign({ id: user.id, jti: sid }, process.env.JWT_SECRET, { expiresIn: '1h' })}; dlas_csrf=${csrf}` };
}
async function run() {
  const server = startServer(0); await new Promise((resolve) => server.once('listening', resolve));
  const root = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (route = '/bookmarks', { actor, method = 'GET', body, csrf = true } = {}) => {
    const headers = actor ? { Cookie: actor.cookie, ...(csrf ? { 'X-CSRF-Token': actor.csrf } : {}) } : {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(root + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    seed();
    const admin = session(db.prepare("SELECT id FROM users WHERE role='admin'").get());
    const maria = session(db.prepare("SELECT id FROM users WHERE email='maria.santos@example.com'").get());
    const juan = session(db.prepare("SELECT id FROM users WHERE email='juan.delacruz@example.com'").get());
    const teacherId = Number(db.prepare("INSERT INTO users(email,password,first_name,last_name,role,status) VALUES('bookmark.teacher@example.test','fixture-only','Test','Teacher','assessor','active')").run().lastInsertRowid);
    const teacher = session({ id: teacherId });
    const quiz = Number(db.prepare("INSERT INTO knowledge_quizzes(title,created_by,status,snapshot_json) VALUES('Bookmark fixture',?,'published','{}')").run(admin.id).lastInsertRowid);
    const research = Number(db.prepare("INSERT INTO assessments(title,created_by,status) VALUES('Research bookmark fixture',?,'active')").run(admin.id).lastInsertRowid);
    db.prepare('INSERT INTO quiz_assignments(quiz_id,user_id,assigned_by) VALUES(?,?,?)').run(quiz, maria.id, admin.id);
    db.prepare('INSERT INTO assessment_assignments(assessment_id,user_id,assigned_by) VALUES(?,?,?)').run(research, maria.id, teacher.id);
    const knowledgePath = `/bookmarks/knowledge/${quiz}`, researchPath = `/bookmarks/research/${research}`;
    console.log('\nAssessment bookmark integration checks');
    check((await request()).status === 401 && (await request(knowledgePath, { method: 'PUT' })).status === 401, 'bookmarks require a signed-in account');
    check((await request('/bookmarks', { actor: maria })).data.data.knowledge.length === 0, 'new accounts start without fabricated bookmarks');
    check((await request(knowledgePath, { actor: maria, method: 'PUT', csrf: false })).status === 403, 'bookmark writes require CSRF protection');
    check((await request(knowledgePath, { actor: maria, method: 'PUT' })).status === 200, 'a student can bookmark an assigned published quiz');
    check((await request(researchPath, { actor: maria, method: 'PUT' })).status === 200, 'a student can bookmark an assigned active research assessment');
    const saved = (await request('/bookmarks', { actor: maria })).data.data;
    check(saved.knowledge.includes(quiz) && saved.research.includes(research), 'knowledge and research bookmarks persist independently');
    check(Object.values(saved).every((items) => items.every(Number.isSafeInteger)), 'bookmark lists expose identifiers, not questions, answers or participant details');
    check(Object.values((await request('/bookmarks', { actor: juan })).data.data).every((items) => !items.length), 'another account cannot see a student’s bookmarks');
    check((await request(knowledgePath, { actor: juan, method: 'PUT' })).status === 404 && (await request(researchPath, { actor: juan, method: 'PUT' })).status === 404, 'students cannot bookmark another student’s unassigned assessments');
    await Promise.all(Array.from({ length: 4 }, () => request(knowledgePath, { actor: maria, method: 'PUT' })));
    check(db.prepare('SELECT COUNT(*) count FROM quiz_bookmarks WHERE user_id=? AND quiz_id=?').get(maria.id, quiz).count === 1, 'concurrent saves and network retries do not create duplicate bookmarks');
    await request(knowledgePath, { actor: maria, method: 'PUT', body: { user_id: juan.id } });
    check(!db.prepare('SELECT 1 FROM quiz_bookmarks WHERE user_id=? AND quiz_id=?').get(juan.id, quiz), 'a supplied user ID cannot change bookmark ownership');
    await request(knowledgePath, { actor: admin, method: 'PUT' });
    await request(knowledgePath, { actor: maria, method: 'DELETE' });
    await request(knowledgePath, { actor: maria, method: 'DELETE' });
    check(!db.prepare('SELECT 1 FROM quiz_bookmarks WHERE user_id=? AND quiz_id=?').get(maria.id, quiz) && db.prepare('SELECT 1 FROM quiz_bookmarks WHERE user_id=? AND quiz_id=?').get(admin.id, quiz), 'removing a bookmark is idempotent and leaves other accounts unchanged');
    for (const route of ['/bookmarks/unknown/1', '/bookmarks/knowledge/0', '/bookmarks/knowledge/1x', '/bookmarks/research/9007199254740992']) check((await request(route, { actor: maria, method: 'PUT' })).status === 400, `invalid bookmark target is rejected: ${route}`);
    check((await request('/bookmarks/knowledge/999999', { actor: admin, method: 'PUT' })).status === 404, 'nonexistent assessments cannot be bookmarked');
    check((await request(knowledgePath, { actor: teacher, method: 'PUT' })).status === 404, 'teachers cannot bookmark another teacher’s knowledge quiz');
    db.prepare('UPDATE knowledge_quizzes SET created_by=? WHERE id=?').run(teacher.id, quiz);
    check((await request(knowledgePath, { actor: teacher, method: 'PUT' })).status === 403, 'retired teachers cannot bookmark even their own quizzes');
    check((await request(researchPath, { actor: teacher, method: 'PUT' })).status === 403, 'retired teachers cannot bookmark previously assigned research assessments');
    await request(knowledgePath, { actor: maria, method: 'PUT' });
    db.prepare("UPDATE knowledge_quizzes SET status='draft' WHERE id=?").run(quiz);
    check(!(await request('/bookmarks', { actor: maria })).data.data.knowledge.includes(quiz) && (await request(knowledgePath, { actor: maria, method: 'PUT' })).status === 404, 'unpublished quizzes without an ongoing attempt are hidden from student bookmarks');
    const now = new Date().toISOString();
    db.prepare("INSERT INTO quiz_attempts(quiz_id,user_id,status,snapshot_json,started_at,integrity_confirmed_at) VALUES(?,?,'in_progress','{}',?,?)").run(quiz, maria.id, now, now);
    check((await request('/bookmarks', { actor: maria })).data.data.knowledge.includes(quiz), 'an existing ongoing attempt remains bookmark-accessible after unpublishing');
    db.prepare('DELETE FROM quiz_assignments WHERE quiz_id=? AND user_id=?').run(quiz, maria.id);
    db.prepare('DELETE FROM assessment_assignments WHERE assessment_id=?').run(research);
    const revoked = (await request('/bookmarks', { actor: maria })).data.data;
    check(!revoked.knowledge.includes(quiz) && !revoked.research.includes(research), 'revoked assignments disappear from saved lists');
    check((await request('/bookmarks', { actor: teacher })).status === 403, 'retired accounts cannot retrieve saved assessments');
    check((await request(knowledgePath, { actor: maria, method: 'DELETE' })).status === 200, 'a student can remove their own stale bookmark after access is withdrawn');
    initializeDatabase();
    check(db.prepare('SELECT status FROM users WHERE id=?').get(teacher.id).status === 'inactive', 'startup disables legacy teacher accounts');
    check(db.prepare('SELECT COUNT(*) count FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL').get(teacher.id).count === 0, 'startup revokes legacy teacher sessions');
    check(db.prepare('SELECT created_by FROM knowledge_quizzes WHERE id=?').get(quiz).created_by === teacher.id, 'retiring a role preserves assessment ownership and history');
    check(db.prepare('SELECT 1 FROM quiz_bookmarks WHERE user_id=? AND quiz_id=?').get(admin.id, quiz), 'schema initialization preserves saved bookmarks');
    await request(researchPath, { actor: admin, method: 'PUT' });
    db.prepare('DELETE FROM assessments WHERE id=?').run(research);
    check(!db.prepare('SELECT 1 FROM assessment_bookmarks WHERE assessment_id=?').get(research), 'deleting an assessment cleans up its bookmarks');
    const disposableUser = Number(db.prepare("INSERT INTO users(email,password,first_name,last_name,role,status) VALUES('bookmark.cleanup@example.test','fixture-only','Cleanup','Account','admin','active')").run().lastInsertRowid);
    db.prepare('INSERT INTO quiz_bookmarks(user_id,quiz_id) VALUES(?,?)').run(disposableUser, quiz);
    db.prepare('DELETE FROM users WHERE id=?').run(disposableUser);
    check(!db.prepare('SELECT 1 FROM quiz_bookmarks WHERE user_id=?').get(disposableUser), 'account deletion cleans up its personal bookmarks');
    check(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'bookmark operations preserve database relationships');
    console.log(`\nBookmark checks: ${checks} passed, 0 failed`);
  } finally { await new Promise((resolve) => server.close(resolve)); db.close(); }
}
run().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (process.env.DLAS_TEST_PARENT_CLEANUP === 'true' && process.send) { process.send({ cleanupDirectory: temporaryDirectory }); return; }
  if (global.gc) { global.gc(); await new Promise(setImmediate); }
  const resolved = path.resolve(temporaryDirectory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('dlas-bookmarks-test-')) throw new Error('Unexpected bookmark test cleanup directory.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
