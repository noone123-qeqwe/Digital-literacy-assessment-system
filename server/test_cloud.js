// No provider credentials are used. Network responses are mocked and all data
// belongs to a temporary local database using the production libSQL library.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { databaseConfiguration } = require('./db/connection');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-cloud-test-'));
Object.assign(process.env, {
  NODE_ENV: 'test', DLAS_DATABASE_DRIVER: 'libsql', DLAS_FREE_DEMO: 'false',
  DLAS_DB_PATH: path.join(temporaryDirectory, 'database', 'accounts.sqlite'),
  DLAS_RESEARCH_ENABLED: 'false', EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test-only-api-key',
  EMAIL_FROM_ADDRESS: 'verified@example.test',
  BACKUP_DIRECTORY: path.join(temporaryDirectory, 'backups'),
  JWT_SECRET: crypto.randomBytes(32).toString('hex'),
  MFA_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  BACKUP_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  CLIENT_URL: 'https://example.test', CORS_ORIGINS: 'https://example.test',
});
for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'RENDER', 'BACKUP_STRATEGY']) process.env[key] = '';
const { db, initializeDatabase } = require('./db/database');
const { sendSecurityEmail, mailConfigurationReady } = require('./utils/email');
const realFetch = global.fetch;

test('remote storage rejects partial credentials, insecure URLs, and free-host local fallback', () => {
  assert.throws(() => databaseConfiguration({ TURSO_DATABASE_URL: 'libsql://test.turso.io' }), /both/);
  assert.throws(() => databaseConfiguration({ TURSO_DATABASE_URL: 'http://test.turso.io', TURSO_AUTH_TOKEN: 'test' }), /secure/);
  assert.throws(() => databaseConfiguration({ TURSO_DATABASE_URL: 'https://user:password@test.turso.io', TURSO_AUTH_TOKEN: 'test' }), /separate/);
  assert.throws(() => databaseConfiguration({ RENDER: 'true', NODE_ENV: 'production', DLAS_FREE_DEMO: 'false' }), /ephemeral/);
  const remote = databaseConfiguration({ TURSO_DATABASE_URL: 'libsql://test.turso.io', TURSO_AUTH_TOKEN: 'test' });
  assert.equal(remote.remote, true); assert.equal(remote.dbPath, null); assert.equal(remote.isTurso, true);
});

test('clean cloud-compatible schema has no sample accounts or synthetic results', () => {
  initializeDatabase(); initializeDatabase();
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM users').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM assessment_attempts').get().count, 0);
  assert.equal(db.prepare("SELECT setting_value FROM system_settings WHERE setting_key='demo_mode'").get().setting_value, '0');
  assert.equal(db.prepare('SELECT 1 AS value').get()._metadata, undefined);
});

test('libSQL transactions roll back partial writes, enforce foreign keys, and retain binary data', () => {
  db.exec('CREATE TABLE driver_test(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, picture BLOB);');
  const insert = db.prepare('INSERT INTO driver_test(name,picture) VALUES(?,?)');
  assert.throws(db.transaction(() => { insert.run('same', Buffer.from('picture')); insert.run('same', null); }), /UNIQUE/);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM driver_test').get().count, 0);
  const id = insert.run('saved', Buffer.from('picture')).lastInsertRowid;
  assert.deepEqual(db.prepare('SELECT picture FROM driver_test WHERE id=?').get(id).picture, Buffer.from('picture'));
  assert.throws(() => db.prepare('INSERT INTO respondent_profiles(user_id) VALUES(?)').run(999999), /FOREIGN KEY/);
});

test('remote-style logical snapshots preserve schema, rows, blobs, and autoincrement state', () => {
  db.exec("INSERT INTO driver_test(id,name) VALUES(100,'removed'); DELETE FROM driver_test WHERE id=100;");
  const snapshotPath = path.join(temporaryDirectory, 'snapshot.sqlite');
  require('./db/snapshot').writeDatabaseSnapshot(db, snapshotPath);
  const target = new (require('node:sqlite').DatabaseSync)(snapshotPath);
  try {
    assert.equal(target.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    assert.equal(target.prepare('SELECT COUNT(*) AS count FROM driver_test').get().count, 1);
    assert.equal(target.prepare("SELECT seq FROM sqlite_sequence WHERE name='driver_test'").get().seq, 100);
    assert.equal(Buffer.from(target.prepare('SELECT picture FROM driver_test').get().picture).toString(), 'picture');
  } finally { target.close(); }
});

test('Brevo email uses the HTTPS API, escapes content, and requires provider acknowledgment', async () => {
  let sent;
  global.fetch = async (url, options) => { sent = { url, options }; return new Response(JSON.stringify({ messageId: 'mock-message' }), { status: 201 }); };
  const result = await sendSecurityEmail({ to: 'student@example.test', subject: 'Verify account', text: '<script>example</script>', actionUrl: 'https://example.test/verify-email?token=test' });
  assert.equal(result.delivered, true); assert.equal(sent.url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(sent.options.headers['api-key'], 'test-only-api-key');
  assert.equal(sent.options.redirect, 'error');
  const message = JSON.parse(sent.options.body);
  assert.equal(message.to[0].email, 'student@example.test');
  assert.match(message.htmlContent, /&lt;script&gt;/); assert.doesNotMatch(message.htmlContent, /<script>/);
  assert.equal(mailConfigurationReady({ EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test', EMAIL_FROM_ADDRESS: 'bad address' }), false);
});

test('email refusal, timeout, and missing acknowledgments never report successful delivery', async () => {
  global.fetch = async () => new Response('private provider error', { status: 429 });
  await assert.rejects(sendSecurityEmail({ to: 'student@example.test', subject: 'test', text: 'test', actionUrl: 'https://example.test' }), /HTTP 429/);
  global.fetch = async () => { throw new Error('private request details'); };
  await assert.rejects(sendSecurityEmail({ to: 'student@example.test', subject: 'test', text: 'test', actionUrl: 'https://example.test' }), /could not be reached/);
  global.fetch = async () => new Response('{}', { status: 201 });
  await assert.rejects(sendSecurityEmail({ to: 'student@example.test', subject: 'test', text: 'test', actionUrl: 'https://example.test' }), /acknowledge/);
});

test('real-account startup provisions only one unverified administrator and preserves research gates', async () => {
  Object.assign(process.env, { NODE_ENV: 'production', BOOTSTRAP_ADMIN_EMAIL: 'admin@example.test', BOOTSTRAP_ADMIN_FIRST_NAME: 'Study', BOOTSTRAP_ADMIN_LAST_NAME: 'Administrator', BOOTSTRAP_ADMIN_PASSWORD: 'Test-only-password-2026' });
  let message;
  global.fetch = async (_url, options) => { message = JSON.parse(options.body); return new Response(JSON.stringify({ messageId: 'admin-verification' }), { status: 201 }); };
  const { bootstrapAdmin } = require('./scripts/bootstrap-admin');
  await bootstrapAdmin();
  const users = db.prepare('SELECT * FROM users').all();
  assert.equal(users.length, 1); assert.equal(users[0].role, 'admin'); assert.equal(users[0].email_verified, 0); assert.equal(users[0].is_demo, 0);
  assert.notEqual(users[0].password, process.env.BOOTSTRAP_ADMIN_PASSWORD);
  assert.equal(await require('bcryptjs').compare(process.env.BOOTSTRAP_ADMIN_PASSWORD, users[0].password), true);
  assert.match(message.htmlContent, /verify-email/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM auth_tokens WHERE token_type='email_verification'").get().count, 1);
  await assert.rejects(bootstrapAdmin(), /clean, empty/);
  assert.equal(require('./utils/studyReadiness').getStudyReadiness().studyCollectionReady, false);
  process.env.BACKUP_STRATEGY = 'turso-pitr';
  assert.throws(() => require('./utils/studyReadiness').assertProductionReady(), /remote/);
  delete process.env.BACKUP_STRATEGY;
  assert.throws(() => require('./db/seed').seed(), /disabled in production/);
  process.env.NODE_ENV = 'test';
});

test('safe setup checker identifies missing services without opening a database or sending emails', () => {
  const checks = require('./scripts/check-production').checkConfiguration({});
  assert.equal(checks.find((check) => check.name === 'Cloud database').ready, false);
  assert.equal(checks.find((check) => check.name === 'Verification email').ready, false);
  assert.doesNotMatch(JSON.stringify(checks), /test-only-api-key|Test-only-password/);
});

after(async () => {
  global.fetch = realFetch;
  db.close();
  if (global.gc) { global.gc(); await new Promise(setImmediate); }
  const resolved = path.resolve(temporaryDirectory);
  if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected temporary test path.');
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
