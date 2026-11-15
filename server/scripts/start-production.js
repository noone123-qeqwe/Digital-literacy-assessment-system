require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

async function startProduction() {
  if (process.env.NODE_ENV !== 'production' || process.env.DLAS_FREE_DEMO !== 'false') {
    throw new Error('The real-account launcher requires NODE_ENV=production and DLAS_FREE_DEMO=false.');
  }
  // Loading the server runs schema migrations and production readiness checks.
  // No sample users, attempts, or results are created by this launcher.
  const { startServer } = require('../server');
  const { db } = require('../db/database');
  const admin = db.prepare("SELECT id FROM users WHERE role='admin' AND is_demo=0").get();
  if (!admin) await require('./bootstrap-admin').bootstrapAdmin();
  return startServer();
}

if (require.main === module) startProduction().catch((error) => {
  // Provider errors can include connection details; the operator can run the
  // safe configuration check separately without exposing secrets to logs.
  console.error('Real-account startup failed:', error.message.replaceAll(process.env.TURSO_AUTH_TOKEN || '\0', '[redacted]').replaceAll(process.env.BREVO_API_KEY || '\0', '[redacted]'));
  process.exitCode = 1;
});

module.exports = { startProduction };
