const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { db, logActivity } = require('../db/database');
const { authenticate, authorize, canAccessAssessment } = require('../middleware/auth');
const { getStudyProfile } = require('../utils/studyProfile');
const { getStudyReadiness } = require('../utils/studyReadiness');
const { sendSecurityEmail, clientUrl } = require('../utils/email');
const { canonicalEmail } = require('../utils/authSecurity');
const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();
const CONSENT_VERSION = process.env.RESEARCH_CONSENT_VERSION || 'masbate-colleges-dlas-study-v1';
const guardianVerifyLimit = rateLimit({ id: 'guardian-consent-verify', windowMs: 15 * 60 * 1000, max: 10, message: 'Too many guardian confirmation attempts. Try again later.' });

function getGuardianConsentRecord(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return db.prepare(`
    SELECT t.assessment_id, t.user_id, t.expires_at, c.guardian_name,
           c.guardian_consent_text_snapshot, c.consent_version,
           u.first_name AS student_first_name, asm.title AS assessment_title
    FROM guardian_consent_tokens t
    JOIN assessment_consents c ON c.assessment_id = t.assessment_id AND c.user_id = t.user_id
    JOIN users u ON u.id = t.user_id
    JOIN assessments asm ON asm.id = t.assessment_id
    WHERE t.token_hash = ? AND t.used_at IS NULL
      AND datetime(t.expires_at) > datetime('now') AND c.status = 'consented'
  `).get(tokenHash) || null;
}

router.post('/:assessmentId', authenticate, authorize('respondent'), [
  body('participant_name').trim().isLength({ min: 2, max: 160 }),
  body('participant_age').isInt({ min: 1, max: 150 }),
  body('participant_confirmed').isBoolean().custom((value) => value === true),
  body('guardian_name').optional({ nullable: true, checkFalsy: true }).trim().isLength({ min: 2, max: 160 }),
  body('guardian_relationship').optional({ nullable: true, checkFalsy: true }).trim().isLength({ min: 2, max: 80 }),
  body('guardian_email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail(),
  body('guardian_confirmed').optional().isBoolean(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Confirm the participation terms and provide the required name fields.', errors: errors.array() });
  }
  const assessmentId = Number.parseInt(req.params.assessmentId, 10);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
  if (!canAccessAssessment(req.user, assessmentId)) return res.status(403).json({ success: false, message: 'You are not assigned to this assessment' });

  const assessment = db.prepare('SELECT id, status, consent_required FROM assessments WHERE id = ?').get(assessmentId);
  if (!assessment || assessment.status !== 'active') return res.status(404).json({ success: false, message: 'This assessment is not available' });
  if (!assessment.consent_required && process.env.NODE_ENV !== 'production') return res.status(409).json({ success: false, message: 'This assessment does not require research consent.' });

  const { profile } = getStudyProfile(req.user.id);
  const submittedAge = Number(req.body.participant_age);
  const profileAge = Number(profile?.age) || 0;
  const participantAge = profileAge > 0 && profileAge < 18 ? profileAge : submittedAge;
  const isMinor = participantAge < 18 || (profileAge > 0 && profileAge < 18);
  const studyInfo = getStudyReadiness().studyInfo;
  const guardianName = String(req.body.guardian_name || '').trim();
  const guardianRelationship = String(req.body.guardian_relationship || '').trim();
  const guardianEmail = String(req.body.guardian_email || '').trim().toLowerCase();
  if (isMinor && (!guardianName || !guardianRelationship || !guardianEmail)) {
    return res.status(400).json({ success: false, message: 'Provide the parent or guardian’s name, relationship, and email. They must confirm consent from their own inbox.' });
  }
  if (isMinor && canonicalEmail(guardianEmail) === canonicalEmail(req.user.email)) {
    return res.status(400).json({ success: false, message: 'The parent or guardian email must be different from the student’s own account email.' });
  }

  try {
    db.prepare(`
      INSERT INTO assessment_consents (
        assessment_id, user_id, status, participant_name, participant_confirmed,
        guardian_name, guardian_relationship, guardian_email, guardian_confirmed,
        guardian_email_verified, participant_age, consent_version, consent_text_snapshot,
        assent_text_snapshot, guardian_consent_text_snapshot, consented_at, withdrawn_at
      ) VALUES (?, ?, 'consented', ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL)
      ON CONFLICT(assessment_id, user_id) DO UPDATE SET
        status = 'consented', participant_name = excluded.participant_name, participant_confirmed = 1,
        guardian_name = excluded.guardian_name, guardian_relationship = excluded.guardian_relationship,
        guardian_email = excluded.guardian_email, guardian_confirmed = excluded.guardian_confirmed,
        guardian_email_verified = excluded.guardian_email_verified, participant_age = excluded.participant_age,
        consent_version = excluded.consent_version, consent_text_snapshot = excluded.consent_text_snapshot,
        assent_text_snapshot = excluded.assent_text_snapshot,
        guardian_consent_text_snapshot = excluded.guardian_consent_text_snapshot,
        consented_at = datetime('now'), withdrawn_at = NULL
    `).run(
      assessmentId,
      req.user.id,
      req.body.participant_name.trim(),
      isMinor ? guardianName : null,
      isMinor ? guardianRelationship : null,
      isMinor ? guardianEmail : null,
      isMinor ? 0 : 1,
      isMinor ? 0 : 1,
      participantAge,
      CONSENT_VERSION,
      studyInfo.consentText,
      studyInfo.assentText,
      studyInfo.guardianConsentText
    );

    if (isMinor) {
      const token = crypto.randomBytes(32).toString('base64url');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      db.prepare(`
        INSERT INTO guardian_consent_tokens (assessment_id, user_id, token_hash, expires_at, used_at)
        VALUES (?, ?, ?, ?, NULL)
        ON CONFLICT(assessment_id, user_id) DO UPDATE SET token_hash = excluded.token_hash,
          expires_at = excluded.expires_at, used_at = NULL, created_at = datetime('now')
      `).run(assessmentId, req.user.id, tokenHash, new Date(Date.now() + 72 * 60 * 60_000).toISOString());
      await sendSecurityEmail({
        to: guardianEmail,
        subject: 'Parent/guardian consent confirmation for DLAS',
        text: `${guardianName}, please review and confirm the consent for the student participating in the Masbate Colleges digital literacy study. This link expires in 72 hours.`,
        actionUrl: clientUrl(`/guardian-consent?token=${encodeURIComponent(token)}`),
      });
    }
    logActivity(req.user.id, 'STUDY_CONSENT', `Consented to research assessment #${assessmentId}`);
    return res.json({
      success: true,
      guardianVerificationPending: isMinor,
      message: isMinor ? 'Student assent recorded. A parent or guardian must confirm from their own email before the assessment can begin.' : 'Consent recorded. You can begin the assessment.',
    });
  } catch (err) {
    console.error('Unable to save assessment consent:', err);
    return next(err);
  }
});

router.post('/guardian/preview', guardianVerifyLimit, [body('token').isString().isLength({ min: 20, max: 200 })], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'This guardian link is invalid or expired.' });
  const record = getGuardianConsentRecord(req.body.token);
  if (!record) return res.status(400).json({ success: false, message: 'This guardian link is invalid, expired, or the consent was withdrawn.' });
  const guardianConsentText = record.guardian_consent_text_snapshot
    || (process.env.NODE_ENV === 'production' ? '' : 'I have reviewed the study information and consent to the student’s participation.');
  if (!guardianConsentText) return res.status(409).json({ success: false, message: 'The approved guardian consent wording is unavailable for this request. Ask the student to request a new link.' });
  return res.json({
    success: true,
    data: {
      guardianName: record.guardian_name,
      studentFirstName: record.student_first_name,
      assessmentTitle: record.assessment_title,
      consentVersion: record.consent_version,
      guardianConsentText,
      expiresAt: record.expires_at,
    },
  });
});

router.post('/guardian/verify', guardianVerifyLimit, [
  body('token').isString().isLength({ min: 20, max: 200 }),
  body('confirmed').isBoolean().custom((value) => value === true),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Review and confirm the guardian consent before continuing.' });
  const record = getGuardianConsentRecord(req.body.token);
  if (!record) return res.status(400).json({ success: false, message: 'This guardian link is invalid, expired, or the consent was withdrawn.' });
  const guardianConsentText = record.guardian_consent_text_snapshot
    || (process.env.NODE_ENV === 'production' ? '' : 'I have reviewed the study information and consent to the student’s participation.');
  if (!guardianConsentText) return res.status(409).json({ success: false, message: 'The approved guardian consent wording is unavailable for this request. Ask the student to request a new link.' });
  db.transaction(() => {
    db.prepare("UPDATE guardian_consent_tokens SET used_at = datetime('now') WHERE assessment_id = ? AND user_id = ?").run(record.assessment_id, record.user_id);
    db.prepare("UPDATE assessment_consents SET guardian_confirmed = 1, guardian_email_verified = 1 WHERE assessment_id = ? AND user_id = ? AND status = 'consented'").run(record.assessment_id, record.user_id);
  })();
  return res.json({ success: true, message: 'Guardian consent confirmed. The student can now begin the assessment.' });
});

router.get('/:assessmentId/status', authenticate, authorize('respondent'), (req, res) => {
  const assessmentId = Number.parseInt(req.params.assessmentId, 10);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
  if (!canAccessAssessment(req.user, assessmentId)) return res.status(403).json({ success: false, message: 'You are not assigned to this assessment' });
  const consent = db.prepare(`SELECT status, guardian_confirmed, guardian_email_verified FROM assessment_consents WHERE assessment_id = ? AND user_id = ?`).get(assessmentId, req.user.id);
  return res.json({ success: true, data: { consented: consent?.status === 'consented', guardianConfirmed: consent?.guardian_confirmed === 1 && consent?.guardian_email_verified === 1 } });
});

router.delete('/:assessmentId', authenticate, authorize('respondent'), (req, res) => {
  const assessmentId = Number.parseInt(req.params.assessmentId, 10);
  if (!Number.isInteger(assessmentId) || assessmentId <= 0) return res.status(400).json({ success: false, message: 'Invalid assessment ID' });
  if (!canAccessAssessment(req.user, assessmentId)) return res.status(403).json({ success: false, message: 'You are not assigned to this assessment' });
  const consent = db.prepare(`
    SELECT ac.status, asm.consent_required
    FROM assessments asm
    LEFT JOIN assessment_consents ac ON ac.assessment_id = asm.id AND ac.user_id = ?
    WHERE asm.id = ?
  `).get(req.user.id, assessmentId);
  if ((!consent?.consent_required && process.env.NODE_ENV !== 'production') || consent.status !== 'consented') {
    return res.status(409).json({ success: false, message: 'There is no active research consent to withdraw for this assessment.' });
  }

  try {
    const withdraw = db.transaction(() => {
      const attempts = db.prepare('SELECT id FROM assessment_attempts WHERE assessment_id = ? AND user_id = ?').all(assessmentId, req.user.id);
      for (const attempt of attempts) {
        db.prepare('DELETE FROM area_results WHERE attempt_id = ?').run(attempt.id);
        db.prepare('DELETE FROM responses WHERE attempt_id = ?').run(attempt.id);
      }
      db.prepare('DELETE FROM assessment_attempts WHERE assessment_id = ? AND user_id = ?').run(assessmentId, req.user.id);
      db.prepare('DELETE FROM assessment_consents WHERE assessment_id = ? AND user_id = ?').run(assessmentId, req.user.id);
      db.prepare('DELETE FROM guardian_consent_tokens WHERE assessment_id = ? AND user_id = ?').run(assessmentId, req.user.id);
      const otherConsent = db.prepare(`
        SELECT 1 FROM assessment_consents ac
        WHERE ac.user_id = ? AND ac.status = 'consented' AND ac.assessment_id != ?
        LIMIT 1
      `).get(req.user.id, assessmentId);
      const researchProfileDeleted = !otherConsent;
      if (researchProfileDeleted) db.prepare('DELETE FROM respondent_profiles WHERE user_id = ?').run(req.user.id);
      db.prepare("DELETE FROM activity_log WHERE user_id = ? AND action IN ('STUDY_CONSENT', 'STUDY_WITHDRAWAL') AND details LIKE ?")
        .run(req.user.id, `%assessment #${assessmentId}%`);
      logActivity(null, 'STUDY_WITHDRAWAL', `A participant withdrew from research assessment #${assessmentId}; saved answers and scores were deleted`);
      return { researchProfileDeleted };
    });
    const { researchProfileDeleted } = withdraw();
    return res.json({
      success: true,
      message: researchProfileDeleted
        ? 'Your saved answers, scores, and study profile were deleted from the active system. Encrypted backup copies may remain until their scheduled expiry.'
        : 'Your saved answers and scores for this assessment were deleted. Your shared study profile remains for another active study consent. Encrypted backup copies may remain until their scheduled expiry.',
    });
  } catch (err) {
    console.error('Unable to withdraw assessment participation:', err);
    return res.status(500).json({ success: false, message: 'Unable to withdraw from this assessment' });
  }
});

module.exports = router;
