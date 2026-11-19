// Role retirement checks run in process with an isolated database; no HTTP listener is needed.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-roles-'));
process.env.NODE_ENV = 'test';
process.env.TURSO_DATABASE_URL = '';
process.env.TURSO_AUTH_TOKEN = '';
process.env.DLAS_DB_PATH = path.join(temporaryDirectory, 'roles.db');
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
const { db, initializeDatabase } = require('./db/database');
const { authenticate, canAccessAssessment, canAccessAttempt } = require('./middleware/auth');
const { issueSession } = require('./utils/authSecurity');
const { isMfaRequired } = require('./utils/mfaPolicy');

function response() {
  return { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function session(userId) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO auth_sessions(id,user_id,expires_at,mfa_verified) VALUES(?,?,?,1)')
    .run(id, userId, new Date(Date.now() + 3600000).toISOString());
  return { id, cookie: `dlas_session=${jwt.sign({ id: userId, jti: id }, process.env.JWT_SECRET)}; dlas_csrf=role-test` };
}
async function route(router, method, routePath, req) {
  const entry = router.stack.find(layer => layer.route?.path === routePath && layer.route.methods[method]);
  assert.ok(entry, `${method} ${routePath} exists`);
  const res = response();
  for (const layer of entry.route.stack) {
    let forwardedError;
    await layer.handle(req, res, error => { forwardedError = error; });
    if (forwardedError) throw forwardedError;
    if (res.body) break;
  }
  return res;
}

(async () => {
  try {
    initializeDatabase();
    const passwordHash = bcrypt.hashSync('ExamplePassword123!', 10);
    const insert = db.prepare("INSERT INTO users(email,password,first_name,last_name,role,status,email_verified,mfa_enabled) VALUES(?,?,'Role','Test',?,'active',1,1)");
    const adminId = Number(insert.run('admin@roles.test', passwordHash, 'admin').lastInsertRowid);
    const studentId = Number(insert.run('student@roles.test', passwordHash, 'respondent').lastInsertRowid);
    const retiredId = Number(insert.run('retired@roles.test', passwordHash, 'assessor').lastInsertRowid);
    const adminSession = session(adminId), studentSession = session(studentId), retiredSession = session(retiredId);
    const req = (cookie, method = 'GET', body = {}) => ({
      method, body, params: {}, query: {}, headers: { cookie },
      get(name) { return name.toLowerCase() === 'x-csrf-token' ? 'role-test' : this.headers[name.toLowerCase()]; },
    });
    for (const active of [adminSession, studentSession]) {
      let allowed = false;
      authenticate(req(active.cookie), response(), () => { allowed = true; });
      assert.ok(allowed, 'supported accounts retain access');
    }
    const rejected = response();
    authenticate(req(retiredSession.cookie), rejected, () => assert.fail('retired role must not authenticate'));
    assert.equal(rejected.statusCode, 403, 'old sessions cannot retain teacher permissions');
    assert.equal(canAccessAssessment({ id: retiredId, role: 'assessor' }, 1), false);
    assert.equal(canAccessAttempt({ id: retiredId, role: 'assessor' }, { user_id: retiredId, assessment_id: 1 }), false);
    assert.throws(() => issueSession(response(), { id: retiredId, role: 'assessor', status: 'active' }, req('')), /not permitted/);
    assert.equal(isMfaRequired({ role: 'admin', mfa_enabled: 0 }), true);

    const users = require('./routes/users');
    const invalidCreate = await route(users, 'post', '/', req(adminSession.cookie, 'POST', {
      email: 'new@roles.test', first_name: 'New', last_name: 'Account', password: 'ExamplePassword123!', role: 'assessor',
    }));
    assert.equal(invalidCreate.statusCode, 400, 'teacher accounts cannot be created');
    const update = req(adminSession.cookie, 'PUT', { role: 'assessor' });
    update.params.id = String(studentId);
    assert.equal((await route(users, 'put', '/:id', update)).statusCode, 400, 'teacher role cannot be assigned');
    const reactivate = req(adminSession.cookie, 'PUT', { status: 'active' });
    reactivate.params.id = String(retiredId);
    assert.equal((await route(users, 'put', '/:id', reactivate)).statusCode, 400, 'retired accounts need an explicit supported role');
    const login = await route(require('./routes/auth'), 'post', '/login', {
      ...req('', 'POST', { email: 'retired@roles.test', password: 'ExamplePassword123!' }), ip: 'role-test',
    });
    assert.equal(login.statusCode, 403, 'retired accounts cannot start new sessions');

    const token = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO auth_tokens(user_id,token_hash,token_type,expires_at) VALUES(?,?,'email_verification',?)")
      .run(retiredId, token, new Date(Date.now() + 3600000).toISOString());
    db.prepare("INSERT INTO mfa_recovery_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)")
      .run(retiredId, token, new Date(Date.now() + 3600000).toISOString());
    db.prepare("INSERT INTO mfa_challenges(id,user_id,challenge_type,expires_at) VALUES(?,?,'login',?)")
      .run(crypto.randomUUID(), retiredId, new Date(Date.now() + 3600000).toISOString());
    const quizId = Number(db.prepare("INSERT INTO knowledge_quizzes(title,created_by,status,snapshot_json) VALUES('Preserved assessment',?,'published','{}')").run(retiredId).lastInsertRowid);
    initializeDatabase();
    initializeDatabase();
    assert.equal(db.prepare('SELECT status FROM users WHERE id=?').get(retiredId).status, 'inactive');
    assert.ok(db.prepare('SELECT revoked_at FROM auth_sessions WHERE id=?').get(retiredSession.id).revoked_at);
    assert.ok(db.prepare('SELECT used_at FROM auth_tokens WHERE user_id=?').get(retiredId).used_at);
    assert.ok(db.prepare('SELECT used_at FROM mfa_recovery_tokens WHERE user_id=?').get(retiredId).used_at);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM mfa_challenges WHERE user_id=?').get(retiredId).count, 0);
    assert.equal(db.prepare('SELECT created_by FROM knowledge_quizzes WHERE id=?').get(quizId).created_by, retiredId);
    assert.equal(db.prepare('SELECT status FROM users WHERE id=?').get(adminId).status, 'active');
    assert.equal(db.prepare('SELECT revoked_at FROM auth_sessions WHERE id=?').get(adminSession.id).revoked_at, null);
    console.log('PASS two-role access, account validation, sign-in, session retirement, recovery invalidation, history preservation, and repeated startup checks');
  } finally {
    db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
