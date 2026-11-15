const express = require('express');
const router = express.Router();
const { getStudyReadiness } = require('../utils/studyReadiness');
const { authenticate, authorize } = require('../middleware/auth');
const { getBackupStatus } = require('../db/backup');
const { mailConfigurationReady, sendSecurityEmail, clientUrl } = require('../utils/email');
const { rateLimit } = require('../middleware/rateLimit');
const { logActivity, databaseConfig } = require('../db/database');
const path = require('path');

const mailTestLimit = rateLimit({ id: 'admin-mail-test', windowMs: 60 * 60 * 1000, max: 3, message: 'Email checks are limited to three per hour.' });

router.get('/status', (req, res) => {
  const { demoMode, studyCollectionReady } = getStudyReadiness();
  return res.json({
    success: true,
    data: {
      demoMode,
      studyCollectionReady,
      freeDemoReadOnly: process.env.DLAS_FREE_DEMO === 'true',
    },
  });
});

router.get('/study-information', (req, res) => {
  const { studyInfo, studyCollectionReady, missing } = getStudyReadiness();
  return res.json({ success: true, data: { studyInfo, studyCollectionReady, missing } });
});

// Safe, administrator-only operational checklist. Never return configured values or secrets.
router.get('/readiness', authenticate, authorize('admin'), (req, res) => {
  const study = getStudyReadiness();
  const backup = getBackupStatus();
  const backupDirectory = String(process.env.BACKUP_DIRECTORY || '').trim();
  const databaseDirectory = path.dirname(path.resolve(process.env.DLAS_DB_PATH || path.join(__dirname, '..', 'db', 'dlas.db')));
  const relativeBackupPath = backupDirectory ? path.relative(databaseDirectory, path.resolve(backupDirectory)) : '';
  const backupOutsideDatabase = Boolean(backupDirectory && path.isAbsolute(backupDirectory)
    && relativeBackupPath !== ''
    && (relativeBackupPath === '..' || relativeBackupPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeBackupPath)));
  const checks = [
    { id: 'demo', label: 'Real study data is separated from demo records', ready: !study.demoMode, detail: study.demoMode ? 'Demo mode is still enabled.' : 'Demo mode is off.' },
    { id: 'consent', label: 'Study consent and governance are approved', ready: !study.demoMode && study.missing.length === 0, detail: study.demoMode ? 'Demo mode must be disabled for real collection.' : study.missing.length ? study.missing.join('; ') : 'Required approval, consent wording, guardian process, contact, and retention settings are present.' },
    { id: 'email', label: 'Account email delivery is configured', ready: mailConfigurationReady(), detail: mailConfigurationReady() ? 'Email provider settings are present. Send a test to check delivery.' : 'Configure an email provider to deliver verification and recovery links.' },
    { id: 'database', label: 'Account storage is configured', ready: process.env.RENDER ? databaseConfig.remote : true, detail: databaseConfig.remote ? 'A remote database stores accounts and results outside the hosting service.' : 'Local SQLite storage is in use; persistent hosting is required.' },
    { id: 'backup', label: backup.strategy === 'turso-pitr' ? 'Cloud recovery policy is configured' : 'An encrypted backup has completed successfully', ready: backup.isReady, detail: backup.strategy === 'turso-pitr' ? 'Turso maintains one day of point-in-time history on its free plan. This does not cover deleting the database and is not an independent encrypted backup.' : backup.lastSuccessAt ? `Last successful backup: ${backup.lastSuccessAt}` : (backup.lastError || 'No successful backup has run in this session.') },
    { id: 'backup-location', label: 'Independent encrypted backup storage is configured', ready: backup.strategy !== 'turso-pitr' && backupOutsideDatabase, detail: backup.strategy === 'turso-pitr' ? 'Independent off-host encrypted backups are still required before research collection.' : backupOutsideDatabase ? 'A separate absolute backup directory is configured.' : 'Configure an absolute BACKUP_DIRECTORY outside the SQLite database folder.' },
    { id: 'secure-deployment', label: 'Secure production origins are configured', ready: /^https:\/\//i.test(process.env.CLIENT_URL || '') && Boolean(process.env.CORS_ORIGINS?.trim()) && /^[a-f0-9]{64}$/i.test(process.env.MFA_ENCRYPTION_KEY || ''), detail: 'Production requires HTTPS, exact CORS origins, and a valid MFA encryption key.' },
  ];
  return res.json({ success: true, data: { demoMode: study.demoMode, studyCollectionReady: study.studyCollectionReady, checks, backup: { lastSuccessAt: backup.lastSuccessAt, lastFailureAt: backup.lastFailureAt, isRunning: backup.isRunning, isReady: backup.isReady, lastError: backup.lastError } } });
});

router.post('/readiness/test-email', authenticate, authorize('admin'), mailTestLimit, async (req, res, next) => {
  if (!mailConfigurationReady()) return res.status(503).json({ success: false, message: 'Email delivery is not configured.' });
  try {
    await sendSecurityEmail({
      to: req.user.email,
      subject: 'DLAS email delivery check',
      text: 'This is a test message requested from the administrator readiness checklist.',
      actionUrl: clientUrl('/admin/dashboard'),
    });
    logActivity(req.user.id, 'SYSTEM_EMAIL_TEST', 'Administrator sent a readiness email check to their own account');
    return res.json({ success: true, message: `A test message was sent to ${req.user.email}.` });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
