require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { db, initializeDatabase, logActivity } = require('../db/database');
const { initializeInstrument } = require('../db/instrument');
const { ensureDigCompSatQuestionBank } = require('../db/digcompsat');
const { assertProductionReady } = require('../utils/studyReadiness');
const { sendSecurityEmail, clientUrl } = require('../utils/email');

async function bootstrapAdmin() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('This command is for provisioning the first administrator in a production database.');
  }
  const { email, firstName, lastName, password } = {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),
    firstName: process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim(),
    lastName: process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim(),
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set a valid BOOTSTRAP_ADMIN_EMAIL.');
  if (!firstName || !lastName) throw new Error('Set BOOTSTRAP_ADMIN_FIRST_NAME and BOOTSTRAP_ADMIN_LAST_NAME.');
  if (!password || password.length < 12 || password.length > 128) throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD to a password between 12 and 128 characters.');

  initializeDatabase();
  assertProductionReady();
  const demoMode = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'demo_mode'").get()?.setting_value === '1';
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (demoMode || userCount > 0) throw new Error('Bootstrap requires a clean, empty, non-demo production database.');
  initializeInstrument(db);
  ensureDigCompSatQuestionBank(db);

  const passwordHash = await bcrypt.hash(password, 12);
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO users (email, password, first_name, last_name, role, status, email_verified, is_demo)
      VALUES (?, ?, ?, ?, 'admin', 'active', 0, 0)
    `).run(email, passwordHash, firstName, lastName);
    db.prepare("INSERT INTO auth_tokens (user_id, token_hash, token_type, expires_at) VALUES (?, ?, 'email_verification', ?)")
      .run(result.lastInsertRowid, tokenHash, expiresAt);
    logActivity(result.lastInsertRowid, 'ADMIN_BOOTSTRAP', 'Initial production administrator provisioned; email verification pending');
    return result.lastInsertRowid;
  });
  const userId = create();
  await sendSecurityEmail({
    to: email,
    subject: 'Verify your DLAS administrator account',
    text: 'The initial Digital Literacy Assessment System administrator account was created for this address. Verify the email address to sign in and enroll an authenticator.',
    actionUrl: clientUrl(`/verify-email?token=${encodeURIComponent(token)}`),
  });
  console.info(`Initial administrator ${userId} created. Email verification is required before first sign-in; authenticator enrollment is required at sign-in.`);
}

bootstrapAdmin().catch((error) => {
  console.error('Administrator bootstrap failed:', error.message);
  process.exitCode = 1;
});
