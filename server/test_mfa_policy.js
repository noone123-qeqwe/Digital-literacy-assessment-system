const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-mfa-policy-'));
process.env.NODE_ENV = 'test';
process.env.DLAS_DATABASE_DRIVER = 'sqlite';
process.env.DLAS_DB_PATH = path.join(temporaryDirectory, 'policy.sqlite');
process.env.JWT_SECRET = 'isolated-account-mfa-policy-suite-2026';
process.env.PORT = '0';
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'BACKUP_STRATEGY', 'DLAS_RESEARCH_ENABLED', 'BREVO_API_KEY', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_HOST', 'MAIL_USER', 'MAIL_PASS']) process.env[key] = '';
const bcrypt = require('bcryptjs');
const { startServer } = require('./server');
const { db } = require('./db/database');
const { encryptSecret } = require('./utils/authSecurity');
const { isMfaRequired } = require('./utils/mfaPolicy');
let passed = 0;
function check(condition, name) { assert.ok(condition, name); passed++; console.log('  PASS ' + name); }

(async () => {
  const server = startServer(0);
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  const password = 'Isolated-policy-password-2026!';
  const hash = await bcrypt.hash(password, 12);
  const insert = db.prepare('INSERT INTO users (email,password,first_name,last_name,role,status,email_verified,is_demo) VALUES (?,?,?,?,?,?,?,?)');
  const optional = Number(insert.run('optional-admin@example.test', hash, 'Optional', 'Administrator', 'admin', 'active', 0, 1).lastInsertRowid);
  const required = Number(insert.run('required-admin@example.test', hash, 'Required', 'Administrator', 'admin', 'active', 1, 0).lastInsertRowid);
  insert.run('required-teacher@example.test', hash, 'Required', 'Teacher', 'assessor', 'active', 1, 0);
  const student = Number(insert.run('student@example.test', hash, 'Fixture', 'Student', 'respondent', 'active', 1, 1).lastInsertRowid);
  const policyKey = 'mfa_optional_user:' + optional;
  const setPolicy = value => db.prepare('INSERT INTO system_settings (setting_key,setting_value) VALUES (?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value').run(policyKey, value);
  setPolicy('1');
  const request = async (route, { method = 'GET', body, cookie } = {}) => {
    const response = await fetch(base + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const cookies = response.headers.getSetCookie().map(value => value.split(';')[0]);
    return { status: response.status, body: await response.json(), cookie: cookies.join('; '), hasSession: cookies.some(value => value.startsWith('dlas_session=')) };
  };
  const login = (email, extra = {}) => request('/auth/login', { method: 'POST', body: { email, password, ...extra } });
  try {
    check(isMfaRequired({ role: 'admin', mfa_enabled: 0 }), 'administrator MFA remains required by default');
    check(isMfaRequired({ role: 'admin', mfa_enabled: 1, mfa_optional: '1' }), 'enrolled MFA is still checked for an optional account');
    check(isMfaRequired({ role: 'admin', mfa_enabled: 0, mfa_optional: 'true' }), 'invalid policy values fail closed');
    const unverified = await login('optional-admin@example.test');
    check(unverified.status === 403 && unverified.body.verificationRequired && !unverified.hasSession, 'an optional-MFA administrator must still verify email');
    db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(optional);
    check((await login('optional-admin@example.test', { password: 'Wrong-isolated-password' })).status === 401, 'optional MFA does not weaken password checks');
    const other = await login('required-admin@example.test', { mfa_optional: '1' });
    check(other.body.mfaRequired && !other.hasSession, 'request-body flags cannot disable MFA for another administrator');
    const teacher = await login('required-teacher@example.test');
    check(teacher.status === 403 && !teacher.hasSession, 'retired teacher accounts cannot sign in');
    const accepted = await login('optional-admin@example.test');
    check(accepted.status === 200 && accepted.hasSession && accepted.body.data.user.role === 'admin' && !accepted.body.mfaRequired, 'the explicitly configured administrator receives a normal session without challenge');
    const factorState = db.prepare('SELECT mfa_enabled,mfa_secret FROM users WHERE id=?').get(optional);
    check(factorState.mfa_enabled === 0 && factorState.mfa_secret === null, 'password-only access does not pretend an authenticator was enrolled');
    check((await request('/auth/me', { cookie: accepted.cookie })).status === 200, 'the authentication middleware accepts the same account policy');
    check((await request('/system/readiness', { cookie: accepted.cookie })).status === 200, 'the designated account can use administrator pages');
    check((await request('/users', { method: 'POST', cookie: accepted.cookie, body: {} })).status === 403, 'mutating administrator actions still require CSRF protection');
    setPolicy('0');
    check((await request('/auth/me', { cookie: accepted.cookie })).status === 403, 'restoring required MFA blocks an unverified active session immediately');
    const requiredAgain = await login('optional-admin@example.test');
    check(requiredAgain.body.mfaRequired && !requiredAgain.hasSession, 'restoring required MFA restores the verification challenge at sign-in');
    setPolicy('1');
    check((await request('/auth/me', { cookie: accepted.cookie })).status === 200, 'the explicit account policy remains consistently applied');
    db.prepare('UPDATE users SET mfa_enabled=1,mfa_secret=? WHERE id=?').run(encryptSecret('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), optional);
    const enrolled = await login('optional-admin@example.test');
    check(enrolled.body.mfaRequired && !enrolled.hasSession, 'an enrolled optional account still receives an actual MFA challenge');
    db.prepare("UPDATE users SET mfa_enabled=0,mfa_secret=NULL,status='inactive' WHERE id=?").run(optional);
    check((await login('optional-admin@example.test')).status === 403 && (await request('/auth/me', { cookie: accepted.cookie })).status === 403, 'deactivation remains effective at login and on existing sessions');
    db.prepare("UPDATE users SET status='active' WHERE id=?").run(optional);
    db.prepare('INSERT INTO system_settings (setting_key,setting_value) VALUES (?,?)').run('mfa_optional_user:' + student, '1');
    const respondent = await login('student@example.test');
    check(respondent.hasSession && (await request('/system/readiness', { cookie: respondent.cookie })).status === 403, 'an account policy never elevates a student role');
    db.prepare("UPDATE auth_sessions SET revoked_at=datetime('now') WHERE user_id=?").run(optional);
    check((await request('/auth/me', { cookie: accepted.cookie })).status === 401, 'revoking sessions still removes access');
    check(db.prepare('SELECT mfa_enabled FROM users WHERE id=?').get(required).mfa_enabled === 0, 'the other administrator account was not modified');
    console.log('MFA policy checks: ' + passed + ' passed, 0 failed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    db.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (global.gc) { global.gc(); await new Promise(setImmediate); }
  const resolved = path.resolve(temporaryDirectory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('dlas-mfa-policy-')) throw Error('Unexpected isolated test directory');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
