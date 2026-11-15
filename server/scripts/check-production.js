require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const { databaseConfiguration } = require('../db/connection');
const { mailConfigurationReady } = require('../utils/email');

function checkConfiguration(env = process.env) {
  const checks = [];
  let database;
  try { database = databaseConfiguration(env); } catch (error) { checks.push({ name: 'Cloud database', ready: false, detail: error.message }); }
  if (database) checks.push({ name: 'Cloud database', ready: database.remote && database.isTurso, detail: database.remote ? 'Remote connection settings are present; live connectivity is checked at startup.' : 'Remote database settings are missing.' });
  checks.push({ name: 'Real accounts', ready: env.NODE_ENV === 'production' && env.DLAS_FREE_DEMO === 'false' });
  checks.push({ name: 'Verification email', ready: mailConfigurationReady(env) && env.EMAIL_PROVIDER === 'brevo', detail: 'A verified Brevo sender and API key are required; this check does not send email.' });
  checks.push({ name: 'Recovery policy', ready: env.BACKUP_STRATEGY === 'turso-pitr' && env.DLAS_RESEARCH_ENABLED === 'false', detail: 'Free cloud recovery is for accounts and quizzes. Research collection remains disabled.' });
  for (const key of ['MFA_ENCRYPTION_KEY', 'BACKUP_ENCRYPTION_KEY']) checks.push({ name: key, ready: /^[a-f0-9]{64}$/i.test(env[key] || '') });
  checks.push({ name: 'Session signing key', ready: (env.JWT_SECRET || '').length >= 32 && !/changeme|replace.?me|secret/i.test(env.JWT_SECRET || '') });
  checks.push({ name: 'HTTPS application address', ready: /^https:\/\//i.test(env.CLIENT_URL || '') || Boolean(env.RENDER_EXTERNAL_HOSTNAME) });
  checks.push({ name: 'Allowed web origins', ready: Boolean(env.CORS_ORIGINS?.trim() || env.RENDER_EXTERNAL_HOSTNAME) });
  checks.push({ name: 'Initial administrator', ready: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.BOOTSTRAP_ADMIN_EMAIL || '') && Boolean(env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() && env.BOOTSTRAP_ADMIN_LAST_NAME?.trim()) && (env.BOOTSTRAP_ADMIN_PASSWORD || '').length >= 12 && env.BOOTSTRAP_ADMIN_PASSWORD.length <= 128, detail: 'Only needed for the first launch; remove the bootstrap password after the administrator is created.' });
  return checks;
}

if (require.main === module) {
  const checks = checkConfiguration();
  for (const check of checks) console.log(`${check.ready ? 'READY' : 'MISSING'}: ${check.name}${check.detail ? ` — ${check.detail}` : ''}`);
  if (checks.some((check) => !check.ready)) process.exitCode = 1;
}
module.exports = { checkConfiguration };
