const { db, databaseConfig } = require('../db/database');
const { mailConfigurationReady } = require('./email');
const path = require('path');

const consentConfiguration = [
  ['RESEARCH_APPROVAL_ID', 'Institutional research/ethics approval reference'],
  ['RESEARCH_CONSENT_VERSION', 'Approved consent document version'],
  ['RESEARCH_CONSENT_TEXT', 'Approved adult consent wording'],
  ['RESEARCH_ASSENT_TEXT', 'Approved participant assent wording'],
  ['GUARDIAN_CONSENT_TEXT', 'Approved parent/guardian consent wording'],
  ['RESEARCHER_NAME', 'Researcher contact name'],
  ['RESEARCHER_EMAIL', 'Researcher contact email'],
  ['DATA_RETENTION_POLICY', 'Institution-approved retention and deletion policy'],
];

function getStudyReadiness() {
  const missing = consentConfiguration
    .filter(([key]) => !String(process.env[key] || '').trim())
    .map(([, label]) => label);
  if (process.env.RESEARCH_CONSENT_APPROVED !== 'true') missing.push('College approval of online consent wording');
  if (process.env.GUARDIAN_PROCESS_APPROVED !== 'true') missing.push('College approval of the guardian identity and consent process');
  if (process.env.RESEARCHER_EMAIL && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.RESEARCHER_EMAIL)) missing.push('A valid researcher contact email');
  if (process.env.DLAS_RESEARCH_ENABLED === 'false') missing.push('Research collection is disabled for this deployment');
  if (process.env.BACKUP_STRATEGY === 'turso-pitr') missing.push('Independent encrypted off-host backups for research collection');
  const demoMode = db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'demo_mode'").get()?.setting_value === '1';
  return {
    demoMode,
    studyCollectionReady: !demoMode && missing.length === 0,
    missing,
    studyInfo: {
      approvalId: process.env.RESEARCH_APPROVAL_ID || '',
      consentVersion: process.env.RESEARCH_CONSENT_VERSION || 'masbate-colleges-dlas-study-v1',
      consentText: process.env.RESEARCH_CONSENT_TEXT || '',
      assentText: process.env.RESEARCH_ASSENT_TEXT || '',
      guardianConsentText: process.env.GUARDIAN_CONSENT_TEXT || '',
      researcherName: process.env.RESEARCHER_NAME || '',
      researcherEmail: process.env.RESEARCHER_EMAIL || '',
      retentionPolicy: process.env.DATA_RETENTION_POLICY || '',
    },
  };
}

function assertProductionReady() {
  const issues = [];
  if (process.env.NODE_ENV !== 'production') return;
  const readiness = getStudyReadiness();
  if (readiness.demoMode) issues.push('The database is marked as containing demonstration data. Use a clean research database before deployment.');
  if (process.env.DLAS_RESEARCH_ENABLED !== 'false' && readiness.missing.length) issues.push(`Study consent and governance configuration is incomplete: ${readiness.missing.join('; ')}`);
  if (!mailConfigurationReady()) issues.push('Configure account verification and recovery email: Brevo API with a verified sender, or a complete SMTP configuration.');
  if (process.env.RENDER && process.env.EMAIL_PROVIDER !== 'brevo') issues.push('Render free hosting requires HTTPS email delivery. Set EMAIL_PROVIDER=brevo.');
  if (!/^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || '')) issues.push('MFA_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  if (!/^[a-f0-9]{64}$/i.test(process.env.BACKUP_ENCRYPTION_KEY || '')) issues.push('BACKUP_ENCRYPTION_KEY must be 64 hexadecimal characters.');
  const backupDirectory = String(process.env.BACKUP_DIRECTORY || '').trim();
  const backupStrategy = process.env.BACKUP_STRATEGY || 'encrypted-files';
  if (!['encrypted-files', 'turso-pitr'].includes(backupStrategy)) issues.push('BACKUP_STRATEGY must be encrypted-files or turso-pitr.');
  if (backupStrategy === 'turso-pitr') {
    if (!databaseConfig.remote || !databaseConfig.isTurso) issues.push('Turso-managed recovery requires a remote .turso.io database.');
    if (process.env.DLAS_RESEARCH_ENABLED !== 'false') issues.push('Managed one-day recovery alone cannot enable research collection.');
  } else if (!backupDirectory || !path.isAbsolute(backupDirectory)) {
    issues.push('BACKUP_DIRECTORY must be an absolute path to a protected persistent backup volume.');
  } else {
    const databaseDirectory = path.dirname(path.resolve(process.env.DLAS_DB_PATH || path.join(__dirname, '..', 'db', 'dlas.db')));
    const relativeBackupPath = path.relative(databaseDirectory, path.resolve(backupDirectory));
    if (relativeBackupPath === '' || (!relativeBackupPath.startsWith(`..${path.sep}`) && relativeBackupPath !== '..' && !path.isAbsolute(relativeBackupPath))) {
      issues.push('BACKUP_DIRECTORY must be outside the SQLite database directory.');
    }
  }
  if (!process.env.CORS_ORIGINS?.trim()) issues.push('CORS_ORIGINS must list the exact production web origins.');
  if (!/^https:\/\//i.test(process.env.CLIENT_URL || '')) issues.push('CLIENT_URL must use HTTPS in production.');
  if (issues.length) throw new Error(`Production readiness checks failed:\n- ${issues.join('\n- ')}`);
}

module.exports = { getStudyReadiness, assertProductionReady };
