const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, logActivity, buildAssessmentSnapshot, DIGCOMPSAT_SCORING_VERSION } = require('../db/database');
const { authenticate, authorize, canAccessAttempt, canAccessAssessment } = require('../middleware/auth');
const { calculateAssessmentResults, calculateDigCompSatResults } = require('../utils/scoring');
const { getStudyProfile } = require('../utils/studyProfile');
const { getStudyReadiness } = require('../utils/studyReadiness');

const INTEGRITY_STATEMENT_VERSION = 'respondent-self-reflection-v1';

function parseSqliteUtc(value) {
  if (!value) return NaN;
  const text = String(value);
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(' ', 'T')}Z`);
}

function isTimeExpired(attempt, timeLimitMinutes) {
  if (!timeLimitMinutes) return false;
  const startedAt = parseSqliteUtc(attempt.started_at);
  return Number.isFinite(startedAt) && Date.now() >= startedAt + timeLimitMinutes * 60_000;
}

function readInstrumentSnapshot(source) {
  try {
    const snapshot = typeof source.instrument_snapshot === 'string' ? JSON.parse(source.instrument_snapshot) : source.instrument_snapshot;
    if (snapshot?.items?.length) return snapshot;
  } catch {}
  const questionIds = db.prepare('SELECT question_id FROM assessment_questions WHERE assessment_id = ? ORDER BY id').all(source.assessment_id).map((row) => row.question_id);
  return buildAssessmentSnapshot(questionIds);
}

function readAttemptResults(attemptId, snapshot = null) {
  const results = db.prepare(`
    SELECT ar.*, ca.name AS area_name, ca.code AS area_code
    FROM area_results ar
    JOIN competence_areas ca ON ca.id = ar.competence_area_id
    WHERE ar.attempt_id = ? ORDER BY ca.sort_order ASC
  `).all(attemptId);
  const areasById = new Map((snapshot?.competenceAreas || []).map((area) => [area.id, area]));
  return results.map((result) => ({ ...result, ...(areasById.get(result.competence_area_id) ? {
    area_name: areasById.get(result.competence_area_id).name,
    area_code: areasById.get(result.competence_area_id).code,
  } : {}) }));
}

function finalizeAttempt(attempt, integrityStatementVersion) {
  const snapshot = readInstrumentSnapshot(attempt);
  const snapshotItems = snapshot?.items || [];
  const itemById = new Map(snapshotItems.map((item) => [item.question_id, item]));
  const storedResponses = db.prepare('SELECT question_id, rating FROM responses WHERE attempt_id = ?').all(attempt.id);
  const responses = storedResponses.map((response) => ({ ...itemById.get(response.question_id), ...response }))
    .filter((response) => Number.isInteger(response.competence_area_id));
  const totalQuestions = snapshotItems.length;
  if (responses.length !== totalQuestions) {
    return {
      error: `Answer every question before submitting. ${responses.length} of ${totalQuestions} questions are answered.`,
      answeredCount: responses.length,
      totalCount: totalQuestions,
    };
  }

  const competenceAreas = snapshot?.competenceAreas || db.prepare('SELECT id, name, code FROM competence_areas ORDER BY sort_order ASC').all();
  const calculated = snapshot?.scoringVersion === DIGCOMPSAT_SCORING_VERSION
    ? calculateDigCompSatResults(responses, competenceAreas)
    : calculateAssessmentResults(responses, competenceAreas);
  const saveResults = db.transaction(() => {
    db.prepare(`
      UPDATE assessment_attempts
      SET status = 'completed', completed_at = datetime('now'), overall_mean = ?, overall_level = ?,
          integrity_confirmed_at = datetime('now'), integrity_statement_version = ?
      WHERE id = ? AND status = 'in_progress'
    `).run(calculated.overallMean, calculated.overallLevel, integrityStatementVersion, attempt.id);

    db.prepare('DELETE FROM area_results WHERE attempt_id = ?').run(attempt.id);
    const insertAreaResult = db.prepare(`
      INSERT INTO area_results (attempt_id, competence_area_id, weighted_mean, standard_deviation, level)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const area of calculated.areaResults) {
      insertAreaResult.run(
        attempt.id,
        area.competence_area_id,
        area.weightedMean,
        area.standardDeviation,
        area.level
      );
    }
    logActivity(attempt.user_id, 'ATTEMPT_SUBMIT', `Completed assessment attempt #${attempt.id}`);
  });

  saveResults();
  return { calculated };
}

// GET /api/attempts/my - Get current user's attempts
router.get('/my', authenticate, (req, res) => {
  try {
    const attempts = db.prepare(`
      SELECT at.*, asm.title AS assessment_title, asm.description AS assessment_description,
             asm.scoring_version AS assessment_scoring_version,
             (SELECT COUNT(*) FROM assessment_questions aq WHERE aq.assessment_id = asm.id) AS total_questions,
             (SELECT COUNT(*) FROM responses r WHERE r.attempt_id = at.id) AS answered_questions
      FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.user_id = ? ORDER BY at.started_at DESC
    `).all(req.user.id);

    if (req.query.include === 'learning_summary' && attempts.length > 0) {
      const completedAttempts = attempts
        .filter((attempt) => attempt.status === 'completed')
        .sort((first, second) => String(second.completed_at || '').localeCompare(String(first.completed_at || '')))
        .slice(0, 8);

      if (completedAttempts.length > 0) {
        const completedIds = completedAttempts.map((attempt) => attempt.id);
        const placeholders = completedIds.map(() => '?').join(', ');

        const allAreaResults = db.prepare(`
          SELECT ar.*, ca.name AS area_name, ca.code AS area_code
          FROM area_results ar
          JOIN competence_areas ca ON ar.competence_area_id = ca.id
          WHERE ar.attempt_id IN (${placeholders})
          ORDER BY ca.sort_order ASC
        `).all(...completedIds);

        const areasByAttemptId = new Map();
        for (const row of allAreaResults) {
          if (!areasByAttemptId.has(row.attempt_id)) {
            areasByAttemptId.set(row.attempt_id, []);
          }
          areasByAttemptId.get(row.attempt_id).push(row);
        }

        const allResponses = db.prepare(`
          SELECT attempt_id, question_id, rating
          FROM responses
          WHERE attempt_id IN (${placeholders})
        `).all(...completedIds);

        const responsesByAttemptId = new Map();
        for (const row of allResponses) {
          if (!responsesByAttemptId.has(row.attempt_id)) {
            responsesByAttemptId.set(row.attempt_id, []);
          }
          responsesByAttemptId.get(row.attempt_id).push(row);
        }

        for (const attempt of completedAttempts) {
          const snapshot = readInstrumentSnapshot(attempt);
          const itemById = new Map((snapshot?.items || []).map((item) => [item.question_id, item]));
          const mappedResponses = (responsesByAttemptId.get(attempt.id) || [])
            .map((response) => ({ ...itemById.get(response.question_id), question_id: response.question_id, rating: response.rating }))
            .filter((response) => Number.isInteger(response.competence_area_id));

          attempt.learning_summary = {
            attempt: {
              id: attempt.id,
              assessment_title: attempt.assessment_title,
              scoring_version: attempt.scoring_version || snapshot?.scoringVersion || attempt.assessment_scoring_version || null,
            },
            areaResults: areasByAttemptId.get(attempt.id) || [],
            responses: mappedResponses,
          };
        }
      }
    }

    return res.json({ success: true, data: attempts });
  } catch (err) {
    console.error('Error fetching attempts:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attempts' });
  }
});

// POST /api/attempts - Start or resume an assigned assessment
router.post('/', authenticate, authorize('respondent'), [
  body('assessment_id').isInt({ min: 1 }).withMessage('Assessment ID required'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const assessmentId = Number(req.body.assessment_id);
  try {
    const studyReadiness = getStudyReadiness();
    if (process.env.NODE_ENV === 'production' && !studyReadiness.studyCollectionReady) {
      return res.status(503).json({ success: false, message: 'Study collection is disabled until institutional consent and governance settings are complete.' });
    }
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(assessmentId);
    if (!assessment) return res.status(404).json({ success: false, message: 'Assessment not found' });
    if (assessment.status !== 'active') {
      return res.status(400).json({ success: false, message: 'This assessment is not active' });
    }
    if (!canAccessAssessment(req.user, assessmentId)) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this assessment' });
    }
    const instrumentSnapshot = readInstrumentSnapshot(assessment);
    if (!instrumentSnapshot?.items?.length) return res.status(400).json({ success: false, message: 'This assessment does not have a valid instrument version.' });
    if (!assessment.instrument_snapshot) {
      db.prepare('UPDATE assessments SET instrument_snapshot = ?, scoring_version = ? WHERE id = ?')
        .run(JSON.stringify(instrumentSnapshot), instrumentSnapshot.scoringVersion, assessmentId);
      assessment.instrument_snapshot = JSON.stringify(instrumentSnapshot);
      assessment.scoring_version = instrumentSnapshot.scoringVersion;
    }

    let attempt = db.prepare(`SELECT * FROM assessment_attempts WHERE assessment_id = ? AND user_id = ?
      ORDER BY started_at DESC, id DESC LIMIT 1`).get(assessmentId, req.user.id);
    if (attempt?.status === 'completed') {
      const attemptCount = db.prepare('SELECT COUNT(*) AS count FROM assessment_attempts WHERE assessment_id = ? AND user_id = ?').get(assessmentId, req.user.id).count;
      const maxAttempts = Math.max(1, Number(assessment.max_attempts || 1));
      if (attemptCount >= maxAttempts) {
        return res.json({ success: true, message: 'All allowed attempts are complete.', data: { attempt, alreadyCompleted: true } });
      }
      attempt = null;
    }

    if (process.env.NODE_ENV === 'production' || assessment.consent_required) {
      const consent = db.prepare(`
        SELECT status, participant_confirmed, guardian_confirmed, guardian_email_verified, participant_age, consent_version
        FROM assessment_consents WHERE assessment_id = ? AND user_id = ?
      `).get(assessmentId, req.user.id);
      const { profile, isComplete: profileComplete } = getStudyProfile(req.user.id);
      const profileAge = Number(profile?.age) || 0;
      const participantAge = Number(consent?.participant_age) || profileAge || null;
      const isMinor = Boolean((participantAge && participantAge < 18) || (profileAge && profileAge < 18));
      const consentIsValid = consent?.status === 'consented'
        && consent.participant_confirmed === 1
        && (!isMinor || (consent.guardian_confirmed === 1 && consent.guardian_email_verified === 1));
      if (!consentIsValid) {
        return res.status(428).json({
          success: false,
          consentRequired: true,
          profileComplete,
          isMinor,
          participantAge,
          guardianPending: Boolean(isMinor && consent?.status === 'consented' && !(consent.guardian_confirmed === 1 && consent.guardian_email_verified === 1)),
          participantName: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim(),
          consentVersion: studyReadiness.studyInfo.consentVersion,
          studyInfo: studyReadiness.studyInfo,
          message: 'Review and sign the study consent before completing your demographic profile or beginning the assessment.',
        });
      }
      const profileConfirmedAfterConsent = profileComplete
        && profile?.profile_consent_version === consent?.consent_version;
      if (!profileConfirmedAfterConsent) {
        return res.status(428).json({
          success: false,
          profileRequired: true,
          message: 'Your consent is recorded. Complete your study profile before beginning the assessment.',
        });
      }
    }

    if (!attempt) {
      const activeQuestionCount = instrumentSnapshot.items.length;
      if (!activeQuestionCount) {
        return res.status(400).json({ success: false, message: 'This assessment has no active questions' });
      }

      const availability = db.prepare(`
        SELECT
          CASE WHEN start_date IS NULL OR datetime(start_date) <= datetime('now') THEN 1 ELSE 0 END AS has_started,
          CASE WHEN end_date IS NULL OR datetime(end_date) >= datetime('now') THEN 1 ELSE 0 END AS has_not_ended
        FROM assessments WHERE id = ?
      `).get(assessmentId);
      if (!availability.has_started) {
        return res.status(400).json({ success: false, message: 'This assessment is not open yet' });
      }
      if (!availability.has_not_ended) {
        return res.status(400).json({ success: false, message: 'The assessment availability period has ended' });
      }

      try {
        const createAttempt = db.transaction(() => {
          const currentCount = db.prepare('SELECT COUNT(*) AS count FROM assessment_attempts WHERE assessment_id = ? AND user_id = ?').get(assessmentId, req.user.id).count;
          if (currentCount >= Math.max(1, Number(assessment.max_attempts || 1))) {
            const limitError = new Error('The allowed number of attempts has been reached.');
            limitError.code = 'DLAS_ATTEMPT_LIMIT';
            throw limitError;
          }
          const inserted = db.prepare(`
            INSERT INTO assessment_attempts (assessment_id, user_id, status, started_at, instrument_snapshot, scoring_version)
            VALUES (?, ?, 'in_progress', datetime('now'), ?, ?)
          `).run(assessmentId, req.user.id, JSON.stringify(instrumentSnapshot), instrumentSnapshot.scoringVersion);
          logActivity(req.user.id, 'ATTEMPT_START', `Started assessment attempt #${inserted.lastInsertRowid}`);
          return inserted.lastInsertRowid;
        });
        attempt = db.prepare('SELECT * FROM assessment_attempts WHERE id = ?').get(createAttempt());
      } catch (err) {
        if (err.code === 'DLAS_ATTEMPT_LIMIT') {
          const latest = db.prepare(`SELECT * FROM assessment_attempts WHERE assessment_id = ? AND user_id = ?
            ORDER BY started_at DESC, id DESC LIMIT 1`).get(assessmentId, req.user.id);
          if (latest?.status === 'completed') return res.json({ success: true, message: err.message, data: { attempt: latest, alreadyCompleted: true } });
          return res.status(409).json({ success: false, message: err.message });
        }
        if (err.code !== 'SQLITE_CONSTRAINT_UNIQUE' && ![1555, 2067].includes(err.errcode)) throw err;
        attempt = db.prepare(`SELECT * FROM assessment_attempts WHERE assessment_id = ? AND user_id = ?
          ORDER BY started_at DESC, id DESC LIMIT 1`).get(assessmentId, req.user.id);
      }
    }

    if (!attempt.instrument_snapshot) {
      db.prepare('UPDATE assessment_attempts SET instrument_snapshot = ?, scoring_version = ? WHERE id = ?')
        .run(JSON.stringify(instrumentSnapshot), instrumentSnapshot.scoringVersion, attempt.id);
      attempt.instrument_snapshot = JSON.stringify(instrumentSnapshot);
      attempt.scoring_version = instrumentSnapshot.scoringVersion;
    }
    const savedRatings = new Map(db.prepare('SELECT question_id, rating FROM responses WHERE attempt_id = ?').all(attempt.id).map((row) => [row.question_id, row.rating]));
    const questions = instrumentSnapshot.items.map((item) => ({
      ...item,
      id: item.question_id,
      saved_rating: savedRatings.get(item.question_id) ?? null,
    }));
    if (!questions.length) {
      return res.status(400).json({ success: false, message: 'This assessment has no active questions' });
    }
    return res.json({ success: true, data: { attempt, assessment, questions } });
  } catch (err) {
    console.error('Error starting attempt:', err);
    return res.status(500).json({ success: false, message: 'Failed to start attempt' });
  }
});

// GET /api/attempts/:id - Get attempt and saved answers
router.get('/:id', authenticate, (req, res) => {
  const attemptId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
  }
  try {
    const attempt = db.prepare(`
      SELECT at.*, asm.title AS assessment_title, asm.description AS assessment_description,
             asm.time_limit_minutes, u.first_name, u.last_name, u.email
      FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      JOIN users u ON u.id = at.user_id WHERE at.id = ?
    `).get(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (!canAccessAttempt(req.user, attempt)) return res.status(403).json({ success: false, message: 'Access denied' });
    if (req.user.role !== 'respondent' || req.user.id !== attempt.user_id) delete attempt.desired_skills;

    const snapshot = readInstrumentSnapshot(attempt);
    const savedRatings = new Map(db.prepare('SELECT question_id, rating FROM responses WHERE attempt_id = ?').all(attempt.id).map((row) => [row.question_id, row.rating]));
    const questions = (snapshot?.items || []).map((item) => ({ ...item, id: item.question_id, saved_rating: savedRatings.get(item.question_id) ?? null }));
    return res.json({ success: true, data: { attempt, questions } });
  } catch (err) {
    console.error('Error fetching attempt:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attempt' });
  }
});

// PUT /api/attempts/:id/respond - Save a single answer or a batch atomically
router.put('/:id/respond', authenticate, authorize('respondent'), [
  body('question_id').optional().isInt({ min: 1 }),
  body('rating').optional().isInt({ min: 0, max: 4 }),
  body('responses').optional().isArray({ min: 1, max: 100 }),
  body('responses.*.question_id').optional().isInt({ min: 1 }),
  body('responses.*.rating').optional().isInt({ min: 0, max: 4 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });

  const attemptId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
  const attempt = db.prepare(`
    SELECT at.*, a.time_limit_minutes FROM assessment_attempts at
    JOIN assessments a ON a.id = at.assessment_id WHERE at.id = ?
  `).get(attemptId);
  if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
  if (attempt.user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ success: false, message: 'Cannot update a completed assessment' });
  if (isTimeExpired(attempt, attempt.time_limit_minutes)) {
    return res.status(410).json({ success: false, message: 'The assessment time limit has expired. Submit your saved responses to finish.' });
  }

  const responses = Array.isArray(req.body.responses)
    ? req.body.responses
    : req.body.question_id !== undefined && req.body.rating !== undefined
      ? [{ question_id: req.body.question_id, rating: req.body.rating }]
      : null;
  if (!responses) return res.status(400).json({ success: false, message: 'Provide responses or question_id and rating' });
  const attemptSnapshot = readInstrumentSnapshot(attempt);
  const isDigCompSat = attemptSnapshot?.scoringVersion === DIGCOMPSAT_SCORING_VERSION;
  const minRating = isDigCompSat ? 0 : 1;
  const maxRating = isDigCompSat ? 3 : 4;
  for (const item of responses) {
    if (!Number.isInteger(item.question_id) || !Number.isInteger(item.rating) || item.rating < minRating || item.rating > maxRating) {
      return res.status(400).json({ success: false, message: `Each response needs an assigned question ID and a rating from ${minRating} to ${maxRating}` });
    }
  }
  const uniqueQuestionIds = [...new Set(responses.map((item) => item.question_id))];
  if (uniqueQuestionIds.length !== responses.length) {
    return res.status(400).json({ success: false, message: 'A question may appear only once in a response batch' });
  }
  const assigned = db.prepare(`
    SELECT question_id FROM assessment_questions
    WHERE assessment_id = ? AND question_id IN (${uniqueQuestionIds.map(() => '?').join(',')})
  `).all(attempt.assessment_id, ...uniqueQuestionIds);
  if (assigned.length !== uniqueQuestionIds.length) {
    return res.status(400).json({ success: false, message: 'Responses can only be saved for questions in this assessment' });
  }

  try {
    const saveBatch = db.transaction(() => {
      const findExisting = db.prepare('SELECT id FROM responses WHERE attempt_id = ? AND question_id = ?');
      const update = db.prepare("UPDATE responses SET rating = ?, answered_at = datetime('now') WHERE id = ?");
      const insert = db.prepare('INSERT INTO responses (attempt_id, question_id, rating) VALUES (?, ?, ?)');
      for (const item of responses) {
        const existing = findExisting.get(attemptId, item.question_id);
        if (existing) update.run(item.rating, existing.id);
        else insert.run(attemptId, item.question_id, item.rating);
      }
    });
    saveBatch();
    const answeredCount = db.prepare('SELECT COUNT(*) AS count FROM responses WHERE attempt_id = ?').get(attemptId).count;
    return res.json({ success: true, message: 'Responses saved', answeredCount });
  } catch (err) {
    console.error('Error saving responses:', err);
    return res.status(500).json({ success: false, message: 'Failed to save responses' });
  }
});

// PUT /api/attempts/:id/desired-skills - Save the questionnaire's open-ended Part III answer
router.put('/:id/desired-skills', authenticate, authorize('respondent'), [
  body('desired_skills').isString().isLength({ max: 1200 }).trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Keep your answer to 1,200 characters or fewer.', errors: errors.array() });
  const attemptId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
  const attempt = db.prepare(`
    SELECT at.*, asm.time_limit_minutes
    FROM assessment_attempts at JOIN assessments asm ON asm.id = at.assessment_id
    WHERE at.id = ?
  `).get(attemptId);
  if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
  if (attempt.user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied' });
  if (readInstrumentSnapshot(attempt)?.scoringVersion === DIGCOMPSAT_SCORING_VERSION) {
    return res.status(409).json({ success: false, message: 'This self-reflection assessment does not include the separate open-ended Part III question.' });
  }
  if (attempt.status !== 'in_progress') return res.status(400).json({ success: false, message: 'The open-ended answer can only be changed before submission.' });
  if (isTimeExpired(attempt, attempt.time_limit_minutes)) {
    return res.status(410).json({ success: false, message: 'The assessment time limit has expired. Your saved answer is retained.' });
  }
  try {
    db.prepare('UPDATE assessment_attempts SET desired_skills = ? WHERE id = ? AND status = \'in_progress\'')
      .run(req.body.desired_skills.trim() || null, attemptId);
    return res.json({ success: true, message: 'Your response was saved.' });
  } catch (err) {
    console.error('Error saving Part III response:', err);
    return res.status(500).json({ success: false, message: 'Failed to save your response' });
  }
});

// POST /api/attempts/:id/reopen - Let the assessment owner restart an expired timer
// while retaining the respondent's autosaved answers.
router.post('/:id/reopen', authenticate, authorize('admin', 'assessor'), (req, res) => {
  const attemptId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(attemptId) || attemptId <= 0) {
    return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
  }

  const attempt = db.prepare(`
    SELECT at.*, asm.time_limit_minutes, asm.status AS assessment_status,
           asm.start_date, asm.end_date, asm.title AS assessment_title
    FROM assessment_attempts at
    JOIN assessments asm ON asm.id = at.assessment_id
    WHERE at.id = ?
  `).get(attemptId);
  if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
  if (!canAccessAttempt(req.user, attempt)) return res.status(403).json({ success: false, message: 'Access denied' });
  if (attempt.status !== 'in_progress') {
    return res.status(409).json({ success: false, message: 'Only an in-progress attempt can be reopened.' });
  }
  if (!isTimeExpired(attempt, attempt.time_limit_minutes)) {
    return res.status(409).json({ success: false, message: 'This attempt has not reached its time limit yet.' });
  }
  if (attempt.assessment_status !== 'active') {
    return res.status(409).json({ success: false, message: 'Activate the assessment before reopening this attempt.' });
  }

  const availability = db.prepare(`
    SELECT
      CASE WHEN start_date IS NULL OR datetime(start_date) <= datetime('now') THEN 1 ELSE 0 END AS has_started,
      CASE WHEN end_date IS NULL OR datetime(end_date) >= datetime('now') THEN 1 ELSE 0 END AS has_not_ended
    FROM assessments WHERE id = ?
  `).get(attempt.assessment_id);
  if (!availability.has_started || !availability.has_not_ended) {
    return res.status(409).json({ success: false, message: 'Update the assessment availability dates before reopening this attempt.' });
  }

  const reopen = db.transaction(() => {
    db.prepare(`
      UPDATE assessment_attempts SET started_at = datetime('now')
      WHERE id = ? AND status = 'in_progress'
    `).run(attemptId);
    logActivity(req.user.id, 'ATTEMPT_REOPEN', `Restarted the timer for attempt #${attemptId} while retaining saved answers`);
  });
  reopen();

  const updatedAttempt = db.prepare('SELECT * FROM assessment_attempts WHERE id = ?').get(attemptId);
  return res.json({
    success: true,
    message: 'Attempt reopened with a fresh time limit. Saved answers were retained.',
    data: updatedAttempt,
  });
});

// POST /api/attempts/:id/submit - Finalize and score saved responses
router.post('/:id/submit', authenticate, authorize('respondent'), (req, res) => {
  const attemptId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
  const attempt = db.prepare('SELECT * FROM assessment_attempts WHERE id = ?').get(attemptId);
  if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
  if (attempt.user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied' });

  if (attempt.status === 'completed') {
    return res.json({
      success: true,
      message: 'Assessment already submitted',
      data: { attemptId, overallMean: attempt.overall_mean, overallLevel: attempt.overall_level, areaResults: readAttemptResults(attemptId, readInstrumentSnapshot(attempt)) },
    });
  }
  if (attempt.status !== 'in_progress') return res.status(400).json({ success: false, message: 'This attempt cannot be submitted' });
  if (req.body?.integrity_confirmed !== true) {
    return res.status(400).json({ success: false, message: 'Confirm that these responses are your own before submitting.' });
  }

  try {
    const { calculated, error, answeredCount, totalCount } = finalizeAttempt(attempt, INTEGRITY_STATEMENT_VERSION);
    if (error) return res.status(400).json({ success: false, message: error, answeredCount, totalCount });
    return res.json({
      success: true,
      message: 'Assessment submitted and scored successfully',
      data: {
        attemptId,
        overallMean: calculated.overallMean,
        overallLevel: calculated.overallLevel,
        areaResults: calculated.areaResults,
        strengths: calculated.strengths,
        weaknesses: calculated.weaknesses,
      },
    });
  } catch (err) {
    console.error('Error submitting assessment:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit assessment' });
  }
});

// GET /api/attempts/:id/results - Comprehensive result report
router.get('/:id/results', authenticate, (req, res) => {
  const attemptId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
  try {
    const attempt = db.prepare(`
      SELECT at.*, asm.title AS assessment_title, asm.description AS assessment_description,
             asm.consent_required,
             u.id AS user_id, u.first_name, u.last_name, u.email
      FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      JOIN users u ON u.id = at.user_id WHERE at.id = ?
    `).get(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found' });
    if (!canAccessAttempt(req.user, attempt)) return res.status(403).json({ success: false, message: 'Access denied' });
    if (attempt.status !== 'completed') return res.status(409).json({ success: false, message: 'Results are available after submission' });
    if (req.user.role !== 'respondent' || req.user.id !== attempt.user_id) delete attempt.desired_skills;

    const snapshot = readInstrumentSnapshot(attempt);
    const areaResults = readAttemptResults(attemptId, snapshot);
    const itemById = new Map((snapshot?.items || []).map((item) => [item.question_id, item]));
    const responses = db.prepare('SELECT question_id, rating FROM responses WHERE attempt_id = ?').all(attemptId)
      .map((response) => ({ ...itemById.get(response.question_id), ...response }))
      .filter((response) => Number.isInteger(response.competence_area_id));
    const sortedResponses = [...responses].sort((a, b) => a.rating - b.rating || a.question_number - b.question_number);
    const lowestRatedSkills = sortedResponses.slice(0, 5);
    const highestRatedSkills = [...sortedResponses].reverse().slice(0, 5);
    const recommendationByArea = {
      PS: ['Problem Solving', 'Troubleshooting & Technical Adaptation', 'Practice basic hardware and software troubleshooting workflows and digital tool selection.'],
      DCC: ['Digital Content Creation', 'Productivity & Multimedia', 'Strengthen office suite skills and proper source citation and copyright practices.'],
      IDL: ['Information and Data Literacy', 'Academic Information Skills', 'Develop effective search techniques and compare source credibility.'],
      S: ['Safety', 'Digital Safety & Privacy', 'Practice cyber hygiene, threat identification, and device protection.'],
      CC: ['Communication and Collaboration', 'Digital Etiquette & Collaboration', 'Improve collaborative document workflows and formal communication etiquette.'],
    };
    const isDigCompSat = snapshot?.scoringVersion === DIGCOMPSAT_SCORING_VERSION;
    const recommendations = lowestRatedSkills.map((item) => {
      const [area, topic, advice] = recommendationByArea[item.area_code];
      return {
        area,
        topic,
        recommendation: isDigCompSat
          ? `You gave this statement a lower self-rating: “${item.question_text}”. Consider a learning activity in this area, then use practical exercises or instructor feedback to check what support would help.`
          : `Target Item #${item.question_number}: "${item.question_text}". ${advice}`,
      };
    });

    return res.json({
      success: true,
      data: {
        attempt,
        areaResults,
        responses,
        lowestRatedSkills,
        highestRatedSkills,
        recommendations,
        scaleInfo: {
          levels: [
            { range: '1.00 – 1.75', level: 'Low', description: 'Requires fundamental instruction and support' },
            { range: '1.76 – 2.50', level: 'Moderate', description: 'Can perform with guidance or occasional difficulty' },
            { range: '2.51 – 3.25', level: 'High', description: 'Capable and independent in most tasks' },
            { range: '3.26 – 4.00', level: 'Very High', description: 'Confident, independent, and advanced mastery' },
          ],
        },
      },
    });
  } catch (err) {
    console.error('Error fetching results:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve assessment results' });
  }
});

module.exports = router;
