// Realistic abuse cases against a disposable database. No hosted accounts or email providers are used.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { inject } = require('./inject');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-security-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DLAS_DB_PATH: path.join(directory, 'security.db'), DLAS_FREE_DEMO: 'false',
  TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '', JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'), BACKUP_ENCRYPTION_KEY: '', BACKUP_STRATEGY: '',
  CORS_ORIGINS: 'https://security-test.local', CLIENT_URL: 'https://security-test.local', TRUST_PROXY: '',
  EMAIL_PROVIDER: 'smtp', SMTP_HOST: '', SMTP_FROM: '', SMTP_USER: '', SMTP_PASS: '', BREVO_API_KEY: '', RESEND_API_KEY: '',
});
const { db, initializeDatabase } = require('../db/database');
initializeDatabase();
const delivered = [];
require('../utils/email').sendSecurityEmail = async message => { delivered.push(message); return { provider: 'isolated-test' }; };
const { app } = require('../server');
const { issueSession, hashCode } = require('../utils/authSecurity');
const outcomes = [];
async function check(name, category, action) {
  try { const evidence = await action(); outcomes.push({ name, category, passed: true, evidence }); console.log(`PASS ${name}`); }
  catch (error) { outcomes.push({ name, category, passed: false, evidence: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
}
function account(email, role = 'respondent', status = 'active') {
  const hash = bcrypt.hashSync('Isolated-fixture-password-2026', 10);
  const id = Number(db.prepare("INSERT INTO users(email,password,first_name,last_name,role,status,email_verified,mfa_enabled) VALUES(?,?,'Security','Fixture',?,?,1,0)").run(email, hash, role, status).lastInsertRowid);
  if (role === 'respondent') db.prepare('INSERT INTO respondent_profiles(user_id) VALUES(?)').run(id);
  return db.prepare('SELECT * FROM users WHERE id=?').get(id);
}
function session(user, mfaVerified = true) {
  const cookies = {};
  const id = issueSession({ cookie(name, value) { cookies[name] = value; } }, user, { get() { return 'isolated security tests'; } }, { mfaVerified });
  return { id, cookies, user, cookie: Object.entries(cookies).map(([name, value]) => `${name}=${value}`).join('; ') };
}
function request(endpoint, { actor, method = 'GET', body, headers = {}, csrf = true, ip, rawBody } = {}) {
  return inject(app, { path: '/api' + endpoint, method, body, rawBody, ip, headers: {
    ...(actor ? { cookie: actor.cookie, ...(csrf ? { 'x-csrf-token': actor.cookies.dlas_csrf } : {}) } : {}), ...headers,
  } });
}
function resetToken(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare("INSERT INTO auth_tokens(user_id,token_hash,token_type,expires_at) VALUES(?,?,'password_reset',?)")
    .run(userId, hashCode(token), new Date(Date.now() + 3600000).toISOString());
  return token;
}
function noKeys(value) {
  if (!value || typeof value !== 'object') return true;
  return Object.entries(value).every(([key, item]) => !['password', 'mfa_secret', 'answers_json', 'correct_answer', 'answers'].includes(key) && noKeys(item));
}

(async () => {
  try {
    const admin = account('admin@security.example.test', 'admin');
    const alice = account('alice@security.example.test'), bob = account('bob@security.example.test');
    const inactive = account('inactive@security.example.test', 'respondent', 'inactive');
    const staff = session(admin), student = session(alice), other = session(bob);
    for (const endpoint of ['/users', '/analytics/dashboard', '/knowledge/questions', `/users/${alice.id}/results`, '/auth/me']) {
      await check(`Unauthenticated access is denied: ${endpoint}`, 'authentication', async () => assert.equal((await request(endpoint)).status, 401));
    }
    for (const endpoint of ['/users', '/analytics/dashboard', '/knowledge/questions']) {
      await check(`Student cannot access staff endpoint: ${endpoint}`, 'authorization', async () => assert.equal((await request(endpoint, { actor: student })).status, 403));
    }
    await check('Student cannot read another student research results', 'ownership', async () => assert.equal((await request(`/users/${bob.id}/results`, { actor: student })).status, 403));
    await check('Self-profile response does not expose password or MFA secret', 'privacy', async () => assert.ok(noKeys((await request('/auth/me', { actor: student })).json)));
    await check('Forged admin role in profile update does not promote a student', 'authorization', async () => {
      const response = await request('/auth/me', { actor: student, method: 'PUT', body: { first_name: 'Fixture', role: 'admin', status: 'active', email_verified: 1 } });
      assert.equal(response.status, 200); assert.equal(db.prepare('SELECT role FROM users WHERE id=?').get(alice.id).role, 'respondent');
    });
    await check('A state-changing request without CSRF header is rejected', 'csrf', async () => assert.equal((await request('/auth/me', { actor: student, method: 'PUT', body: { first_name: 'Blocked' }, csrf: false })).status, 403));
    await check('A mismatched CSRF token is rejected', 'csrf', async () => assert.equal((await request('/auth/me', { actor: student, method: 'PUT', body: {}, headers: { 'x-csrf-token': 'attacker-value' } })).status, 403));
    await check('A forged JWT signature cannot access an administrator endpoint', 'authentication', async () => {
      const fake = jwt.sign({ id: admin.id, jti: staff.id, role: 'admin' }, 'attacker-controlled-signing-key');
      assert.equal((await request('/users', { headers: { cookie: `dlas_session=${fake}` } })).status, 401);
    });
    await check('Revoked sessions stop working immediately', 'sessions', async () => {
      const stolen = session(alice); db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE id=?").run(stolen.id);
      assert.equal((await request('/auth/me', { actor: stolen })).status, 401);
    });
    await check('A suspended account loses access even with an existing session', 'sessions', async () => {
      const target = account('suspend@security.example.test'), active = session(target);
      db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(target.id);
      assert.equal((await request('/auth/me', { actor: active })).status, 403);
    });
    await check('An admin session without required MFA verification is denied', 'mfa', async () => assert.equal((await request('/users', { actor: session(admin, false) })).status, 403));
    await check('Cross-origin JavaScript is not given CORS permission', 'cors', async () => {
      const response = await request('/health', { headers: { origin: 'https://attacker.example' } });
      assert.equal(response.headers['access-control-allow-origin'], undefined);
    });
    await check('Security headers prevent framing and unsafe script loading', 'headers', async () => {
      const response = await request('/health'); assert.match(response.headers['content-security-policy'], /script-src 'self'/); assert.match(response.headers['content-security-policy'], /frame-ancestors 'self'/); assert.equal(response.headers['x-content-type-options'], 'nosniff');
    });
    await check('Production session cookies are Secure, HttpOnly and SameSite Strict', 'cookies', async () => {
      const original = process.env.NODE_ENV, flags = [];
      try { process.env.NODE_ENV = 'production'; issueSession({ cookie(name, _value, options) { flags.push({ name, options }); } }, admin, { get() { return 'test'; } }); }
      finally { process.env.NODE_ENV = original; }
      const token = flags.find(item => item.name === 'dlas_session').options;
      assert.equal(token.secure, true); assert.equal(token.httpOnly, true); assert.equal(token.sameSite, 'strict');
    });
    await check('SQL injection in an account search returns no extra accounts', 'injection', async () => {
      const response = await request('/users?search=' + encodeURIComponent("' OR 1=1 --"), { actor: staff });
      assert.equal(response.status, 200); assert.equal(response.json.data.users.length, 0);
    });
    await check('Malicious SVG uploads cannot be stored as profile pictures', 'uploads', async () => {
      const image = 'data:image/svg+xml;base64,' + Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
      assert.equal((await request('/auth/me/profile-picture', { actor: student, method: 'PUT', body: { image } })).status, 400);
    });
    await check('Forged PNG content cannot bypass image signature validation', 'uploads', async () => {
      const image = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64');
      assert.equal((await request('/auth/me/profile-picture', { actor: student, method: 'PUT', body: { image } })).status, 400);
    });
    await check('Oversized JSON requests are rejected before route processing', 'input-limits', async () => assert.equal((await request('/auth/me', { actor: student, method: 'PUT', body: { first_name: 'x'.repeat(1024 * 1024 + 1) } })).status, 413));
    await check('Malformed JSON returns a client error without a stack trace', 'input-limits', async () => {
      const response = await request('/auth/login', { method: 'POST', rawBody: '{"email":' });
      assert.equal(response.status, 400); assert.ok(!response.text.includes('at Layer'));
    });
    await check('Repeated login guesses are rate limited, even with spoofed proxy headers', 'brute-force', async () => {
      db.exec('DELETE FROM rate_limit_buckets');
      let response;
      for (let i = 0; i < 11; i++) response = await request('/auth/login', { method: 'POST', ip: '127.0.0.55', headers: { 'x-forwarded-for': `203.0.113.${i + 1}` }, body: { email: 'missing@security.example.test', password: 'incorrect' } });
      assert.equal(response.status, 429); assert.ok(Number(response.headers['retry-after']) > 0);
      db.exec('DELETE FROM rate_limit_buckets');
    });
    await check('Password reset tokens cannot be replayed after successful use', 'recovery', async () => {
      const target = account('reset-replay@security.example.test'), token = resetToken(target.id);
      const payload = { method: 'POST', body: { token, new_password: 'Replacement-test-password-2026' } };
      assert.equal((await request('/auth/reset-password', payload)).status, 200);
      assert.equal((await request('/auth/reset-password', payload)).status, 400);
    });
    await check('Two simultaneous reset requests cannot redeem the same token twice', 'recovery-race', async () => {
      const target = account('reset-race@security.example.test'), token = resetToken(target.id);
      const passwords = ['First-test-password-2026', 'Second-test-password-2026'];
      const responses = await Promise.all(passwords.map(new_password => request('/auth/reset-password', { method: 'POST', body: { token, new_password } })));
      assert.equal(responses.filter(item => item.status === 200).length, 1, `Expected one successful redemption; received HTTP ${responses.map(item => item.status).join(', ')}`);
      assert.equal(responses.find(item => item.status !== 200).status, 400);
      const saved = db.prepare('SELECT password FROM users WHERE id=?').get(target.id).password;
      assert.ok(bcrypt.compareSync(passwords[responses.findIndex(item => item.status === 200)], saved));
    });
    await check('Resetting a password invalidates a pending MFA login challenge', 'recovery-mfa', async () => {
      const target = account('reset-mfa@security.example.test', 'admin'), token = resetToken(target.id);
      const challengeId = crypto.randomBytes(32).toString('base64url');
      db.prepare("INSERT INTO mfa_challenges(id,user_id,challenge_type,otp_hash,expires_at) VALUES(?,?,'login',?,?)").run(challengeId, target.id, hashCode('281674'), new Date(Date.now() + 3600000).toISOString());
      assert.equal((await request('/auth/reset-password', { method: 'POST', body: { token, new_password: 'Reset-MFA-test-password-2026' } })).status, 200);
      const oldChallenge = await request('/auth/mfa/verify', { method: 'POST', body: { challenge_id: challengeId, code: '281674' } });
      assert.equal(oldChallenge.status, 401, `Pre-reset challenge still signs in: HTTP ${oldChallenge.status}`);
    });
    for (const change of ['expires', 'deactivated', 'reissued']) {
      await check(`A reset token that becomes ${change} during password hashing is rejected`, 'recovery-race', async () => {
        const target = account(`reset-${change}@security.example.test`), token = resetToken(target.id);
        const original = bcrypt.hash;
        try {
          bcrypt.hash = async (...args) => {
            const hashed = await original(...args);
            if (change === 'expires') db.prepare("UPDATE auth_tokens SET expires_at=datetime('now','-1 minute') WHERE user_id=?").run(target.id);
            if (change === 'deactivated') db.prepare("UPDATE users SET status='inactive' WHERE id=?").run(target.id);
            if (change === 'reissued') {
              db.prepare("UPDATE auth_tokens SET used_at=datetime('now') WHERE user_id=?").run(target.id);
              resetToken(target.id);
            }
            return hashed;
          };
          assert.equal((await request('/auth/reset-password', { method: 'POST', body: { token, new_password: 'Should-not-save-password-2026' } })).status, 400);
          assert.equal(db.prepare('SELECT password FROM users WHERE id=?').get(target.id).password, target.password);
        } finally { bcrypt.hash = original; }
      });
    }
    await check('A login started with an old password cannot finish after the password changes', 'login-race', async () => {
      const target = account('login-race@security.example.test');
      const original = bcrypt.compare;
      try {
        bcrypt.compare = async (...args) => {
          const matches = await original(...args);
          db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync('Changed-during-sign-in-2026', 10), target.id);
          return matches;
        };
        assert.equal((await request('/auth/login', { method: 'POST', body: { email: target.email, password: 'Isolated-fixture-password-2026' } })).status, 401);
        assert.equal(db.prepare('SELECT COUNT(*) n FROM auth_sessions WHERE user_id=?').get(target.id).n, 0);
      } finally { bcrypt.compare = original; }
    });
    for (const action of ['self', 'admin']) {
      await check(`${action === 'self' ? 'Changing' : 'Administrator changing'} a password invalidates pending sign-ins and recovery links`, 'password-change', async () => {
        const target = account(`password-change-${action}@security.example.test`, 'admin'), current = session(target), previous = session(target);
        const challengeId = crypto.randomBytes(32).toString('base64url'), token = resetToken(target.id);
        db.prepare("INSERT INTO mfa_challenges(id,user_id,challenge_type,otp_hash,expires_at) VALUES(?,?,'login',?,?)").run(challengeId, target.id, hashCode('281674'), new Date(Date.now() + 3600000).toISOString());
        db.prepare('INSERT INTO mfa_recovery_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)').run(target.id, hashCode(crypto.randomBytes(32).toString('hex')), new Date(Date.now() + 3600000).toISOString());
        const response = action === 'self'
          ? await request('/auth/me/password', { actor: current, method: 'PUT', body: { current_password: 'Isolated-fixture-password-2026', new_password: 'Changed-test-password-2026' } })
          : await request(`/users/${target.id}`, { actor: staff, method: 'PUT', body: { password: 'Changed-test-password-2026' } });
        assert.equal(response.status, 200);
        assert.equal((await request('/auth/me', { actor: previous })).status, 401);
        assert.equal((await request('/auth/mfa/verify', { method: 'POST', body: { challenge_id: challengeId, code: '281674' } })).status, 401);
        assert.equal((await request('/auth/reset-password', { method: 'POST', body: { token, new_password: 'Stale-link-password-2026' } })).status, 400);
        assert.equal(db.prepare('SELECT COUNT(*) n FROM mfa_recovery_tokens WHERE user_id=? AND used_at IS NULL').get(target.id).n, 0);
        assert.equal((await request('/auth/me', { actor: current })).status, action === 'self' ? 200 : 401);
      });
    }
    await check('Invalid passwords do not reveal whether an account is deactivated', 'enumeration', async () => {
      db.exec('DELETE FROM rate_limit_buckets');
      const unknown = await request('/auth/login', { method: 'POST', body: { email: 'unknown@security.example.test', password: 'wrong' } });
      const disabled = await request('/auth/login', { method: 'POST', body: { email: inactive.email, password: 'wrong' } });
      assert.equal(disabled.status, unknown.status, `Unknown account HTTP ${unknown.status}; inactive account HTTP ${disabled.status}`);
      assert.equal(disabled.json.message, unknown.json.message);
      const active = await request('/auth/login', { method: 'POST', body: { email: alice.email, password: 'wrong' } });
      assert.equal(active.status, unknown.status);
      assert.equal(active.json.message, unknown.json.message);
    });

    const category = db.prepare('SELECT id FROM quiz_categories ORDER BY id LIMIT 1').get();
    const question = await request('/knowledge/questions', { actor: staff, method: 'POST', body: { category_id: category.id, prompt: 'Security fixture: is two plus two four?', type: 'true_false', correct_answer: 'true', points: 1, explanation: 'Isolated answer-key fixture only.' } });
    assert.equal(question.status, 200);
    const questionId = question.json.data.id;
    const quiz = await request('/knowledge/quizzes', { actor: staff, method: 'POST', body: { title: 'Isolated security scenario quiz', description: '', instructions: 'Isolated test.', question_ids: [questionId], assigned_user_ids: [alice.id], status: 'published', time_limit_minutes: 5, max_attempts: 2, pass_percentage: 60, randomize: false } });
    assert.equal(quiz.status, 201);
    const quizId = quiz.json.data.id;
    await check('An unassigned student cannot start someone else\'s quiz', 'assessment-access', async () => assert.equal((await request(`/knowledge/quizzes/${quizId}/start`, { actor: other, method: 'POST', body: { accepted_instructions: true } })).status, 403));
    const attempt = await request(`/knowledge/quizzes/${quizId}/start`, { actor: student, method: 'POST', body: { accepted_instructions: true } });
    assert.equal(attempt.status, 200);
    const attemptId = attempt.json.data.attempt.id;
    await check('An active quiz response hides the scoring answer key', 'assessment-secrecy', async () => assert.ok(noKeys(attempt.json.data)));
    for (const [method, suffix, body] of [['GET', '', undefined], ['PUT', '/answers', { expected_revision: 0, responses: [{ question_id: questionId, answer: 'true' }] }], ['POST', '/submit', {}], ['GET', '/export/pdf', undefined]]) {
      await check(`Another student cannot ${method} an owned attempt${suffix}`, 'assessment-ownership', async () => assert.equal((await request(`/knowledge/attempts/${attemptId}${suffix}`, { actor: other, method, body })).status, 403));
    }
    await check('A forged question ID cannot alter an attempt', 'assessment-input', async () => {
      assert.equal((await request(`/knowledge/attempts/${attemptId}/answers`, { actor: student, method: 'PUT', body: { expected_revision: 0, responses: [{ question_id: 999999, answer: 'true' }] } })).status, 400);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM quiz_responses WHERE attempt_id=?').get(attemptId).n, 0);
    });
    await check('Client-supplied scores do not change server-calculated results', 'score-tampering', async () => {
      assert.equal((await request(`/knowledge/attempts/${attemptId}/answers`, { actor: student, method: 'PUT', body: { expected_revision: 0, responses: [{ question_id: questionId, answer: 'false' }], percentage: 100 } })).status, 200);
      const submitted = await request(`/knowledge/attempts/${attemptId}/submit`, { actor: student, method: 'POST', body: { percentage: 100, earned_points: 99999, certificate_earned: true } });
      assert.equal(submitted.status, 200); assert.equal(submitted.json.data.results.percentage, 0);
    });
    await check('Correct answers remain hidden while a published quiz is retakable', 'assessment-secrecy', async () => {
      const response = await request(`/knowledge/attempts/${attemptId}`, { actor: student });
      assert.equal(response.json.data.results.review_locked, true); assert.ok(noKeys(response.json.data));
    });
    await check('Completed attempts cannot be overwritten', 'assessment-integrity', async () => assert.equal((await request(`/knowledge/attempts/${attemptId}/answers`, { actor: student, method: 'PUT', body: { expected_revision: 1, responses: [{ question_id: questionId, answer: 'true' }] } })).status, 409));
    await check('Server deadlines reject answers even if the client timer is changed', 'assessment-integrity', async () => {
      const next = await request(`/knowledge/quizzes/${quizId}/start`, { actor: student, method: 'POST', body: { accepted_instructions: true } });
      const timedId = next.json.data.attempt.id;
      db.prepare('UPDATE quiz_attempts SET deadline=? WHERE id=?').run(new Date(Date.now() - 60000).toISOString(), timedId);
      assert.equal((await request(`/knowledge/attempts/${timedId}/answers`, { actor: student, method: 'PUT', body: { expected_revision: 0, responses: [{ question_id: questionId, answer: 'true' }], deadline: new Date(Date.now() + 3600000).toISOString() } })).status, 410);
    });
  } catch (error) { outcomes.push({ name: 'Scenario runner completed', category: 'harness', passed: false, evidence: error.stack }); console.error(error); }
  finally {
    const result = { executedAt: new Date().toISOString(), environment: 'Disposable SQLite database; in-process Express requests; simulated email; no live account mutations', total: outcomes.length, passed: outcomes.filter(item => item.passed).length, failed: outcomes.filter(item => !item.passed).length, outcomes };
    const destination = path.resolve(process.env.DLAS_SECURITY_REPORT || path.join(__dirname, '..', '..', 'tmp', 'security-results.json'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(result, null, 2));
    console.log(`SECURITY RESULTS: ${result.passed}/${result.total} passed; ${result.failed} findings. Saved ${destination}`);
    db.close();
    if (result.failed) process.exitCode = 1;
  }
})();
