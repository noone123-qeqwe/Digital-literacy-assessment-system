const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { db, logActivity, SCORING_VERSION, DIGCOMPSAT_SCORING_VERSION, DLAS_INSTRUMENT_CODE, DIGCOMPSAT_INSTRUMENT_CODE } = require('../db/database');
const { authenticate, authorize, canAccessAssessment } = require('../middleware/auth');
const { getProficiencyLevel, roundTo } = require('../utils/scoring');
const { buildInferentialComparisons } = require('../utils/inference');
const MIN_REPORT_GROUP_SIZE = 5;

function assessmentScope(user, alias = 'asm', assessmentId = null) {
  if (user.role === 'admin') {
    return assessmentId === null
      ? { sql: '1 = 1', params: [] }
      : { sql: `${alias}.id = ?`, params: [assessmentId] };
  }
  const scope = {
    sql: `(${alias}.created_by = ? OR EXISTS (
      SELECT 1 FROM assessment_assignments scope_aa
      WHERE scope_aa.assessment_id = ${alias}.id AND scope_aa.assigned_by = ?
    ))`,
    params: [user.id, user.id],
  };
  if (assessmentId === null) return scope;
  return { sql: `(${scope.sql}) AND ${alias}.id = ?`, params: [...scope.params, assessmentId] };
}

function getAssessmentFilter(req, res) {
  const rawId = req.query.assessment_id;
  if (rawId === undefined || rawId === '') return null;
  const assessmentId = Number(rawId);
  if (!Number.isSafeInteger(assessmentId) || assessmentId <= 0) {
    res.status(400).json({ success: false, message: 'Invalid assessment ID' });
    return false;
  }
  if (!db.prepare('SELECT id FROM assessments WHERE id = ?').get(assessmentId)) {
    res.status(404).json({ success: false, message: 'Assessment not found' });
    return false;
  }
  if (!canAccessAssessment(req.user, assessmentId)) {
    res.status(403).json({ success: false, message: 'You do not have access to this assessment' });
    return false;
  }
  return assessmentId;
}

function scoreContext(assessmentId) {
  const scoringVersion = assessmentId === null
    ? SCORING_VERSION
    : db.prepare('SELECT scoring_version FROM assessments WHERE id = ?').get(assessmentId)?.scoring_version || SCORING_VERSION;
  const isSelfReflection = scoringVersion === DIGCOMPSAT_SCORING_VERSION;
  return {
    scoringVersion,
    instrumentCode: isSelfReflection ? DIGCOMPSAT_INSTRUMENT_CODE : DLAS_INSTRUMENT_CODE,
    scoreScaleMax: isSelfReflection ? 3 : 4,
    isSelfReflection,
  };
}

function cronbachAlpha(itemRows, questionIds) {
  const byAttempt = new Map();
  for (const row of itemRows) {
    if (!byAttempt.has(row.attempt_id)) byAttempt.set(row.attempt_id, new Map());
    byAttempt.get(row.attempt_id).set(row.question_id, row.rating);
  }
  const complete = [...byAttempt.values()].filter((values) => questionIds.every((id) => values.has(id)));
  const itemCount = questionIds.length;
  if (itemCount < 2 || complete.length < 2) return { alpha: null, sampleSize: complete.length, itemCount };
  const columnMeans = questionIds.map((id) => complete.reduce((sum, row) => sum + row.get(id), 0) / complete.length);
  const itemVariances = questionIds.map((id, index) => complete.reduce((sum, row) => sum + (row.get(id) - columnMeans[index]) ** 2, 0) / (complete.length - 1));
  const totalScores = complete.map((row) => questionIds.reduce((sum, id) => sum + row.get(id), 0));
  const totalMean = totalScores.reduce((sum, score) => sum + score, 0) / totalScores.length;
  const totalVariance = totalScores.reduce((sum, score) => sum + (score - totalMean) ** 2, 0) / (totalScores.length - 1);
  const alpha = totalVariance > 0 ? (itemCount / (itemCount - 1)) * (1 - itemVariances.reduce((sum, variance) => sum + variance, 0) / totalVariance) : null;
  return { alpha: Number.isFinite(alpha) ? Math.round(alpha * 1000) / 1000 : null, sampleSize: complete.length, itemCount };
}

// GET /api/analytics/dashboard - Metrics over the caller's visible cohort
router.get('/dashboard', authenticate, authorize('admin'), (req, res) => {
  try {
    const assessmentId = getAssessmentFilter(req, res);
    if (assessmentId === false) return;
    const scope = assessmentScope(req.user, 'asm', assessmentId);
    const score = scoreContext(assessmentId);
    const scoreScope = `at.scoring_version = ? AND ${scope.sql}`;
    const scoreScopeParams = [score.scoringVersion, ...scope.params];
    const totalParticipants = assessmentId !== null
      ? db.prepare(`
          SELECT COUNT(DISTINCT aa.user_id) AS count
          FROM assessment_assignments aa JOIN assessments asm ON asm.id = aa.assessment_id
          WHERE ${scope.sql}
        `).get(...scope.params).count
      : req.user.role === 'admin'
      ? db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'respondent'").get().count
      : db.prepare(`
          SELECT COUNT(DISTINCT aa.user_id) AS count
          FROM assessment_assignments aa JOIN assessments asm ON asm.id = aa.assessment_id
          WHERE ${scope.sql}
        `).get(...scope.params).count;
    const totalAssessments = db.prepare(`
      SELECT COUNT(*) AS count FROM assessments asm WHERE asm.status != 'archived' AND ${scope.sql}
    `).get(...scope.params).count;
    const completedAttempts = db.prepare(`
      SELECT COUNT(*) AS count FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'completed' AND ${scope.sql}
    `).get(...scope.params).count;
    const inProgressAttempts = db.prepare(`
      SELECT COUNT(*) AS count FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'in_progress' AND ${scope.sql}
    `).get(...scope.params).count;
    const avgScoreRow = db.prepare(`
      SELECT ROUND(AVG(at.overall_mean), 2) AS avg_score FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'completed' AND ${scoreScope}
    `).get(...scoreScopeParams);
    const scoreRows = db.prepare(`
      SELECT at.overall_mean FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'completed' AND ${scoreScope}
    `).all(...scoreScopeParams);
    const rawAverage = scoreRows.length
      ? scoreRows.reduce((sum, row) => sum + row.overall_mean, 0) / scoreRows.length
      : 0;
    const standardDeviation = scoreRows.length > 1
      ? Math.round(Math.sqrt(scoreRows.reduce((sum, row) => sum + (row.overall_mean - rawAverage) ** 2, 0) / (scoreRows.length - 1)) * 100) / 100
      : 0;
    const distributionRows = db.prepare(`
      SELECT at.overall_level, COUNT(*) AS count FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'completed' AND ${scoreScope} GROUP BY at.overall_level
    `).all(...scoreScopeParams);

    const proficiencyDistribution = score.isSelfReflection
      ? { 'Self-reflection profile': 0 }
      : { Low: 0, Moderate: 0, High: 0, 'Very High': 0 };
    for (const row of distributionRows) {
      if (Object.hasOwn(proficiencyDistribution, row.overall_level)) {
        proficiencyDistribution[row.overall_level] = row.count;
      }
    }

    const areaScores = db.prepare(`
      SELECT ar.competence_area_id, ar.weighted_mean
      FROM area_results ar
      JOIN assessment_attempts at ON at.id = ar.attempt_id AND at.status = 'completed'
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE ${scoreScope} AND ar.weighted_mean IS NOT NULL
    `).all(...scoreScopeParams);
    const areaStats = new Map();
    for (const score of areaScores) {
      const scores = areaStats.get(score.competence_area_id) || [];
      scores.push(score.weighted_mean);
      areaStats.set(score.competence_area_id, scores);
    }
    const areaPerformance = db.prepare('SELECT id, name, code, sort_order FROM competence_areas ORDER BY sort_order ASC').all()
      .map((area) => {
        const scores = areaStats.get(area.id) || [];
        const mean = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
        const sd = scores.length > 1
          ? Math.sqrt(scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / (scores.length - 1))
          : scores.length ? 0 : null;
        return {
          ...area,
          weighted_mean: mean === null ? null : roundTo(mean),
          sd: sd === null ? null : roundTo(sd),
          descriptive_level: score.isSelfReflection ? (mean === null ? 'N/A' : 'Self-reflection') : getProficiencyLevel(mean),
          response_count: scores.length,
        };
      });

    const lowestRatedSkills = db.prepare(`
      SELECT q.id, q.question_number, q.question_text, ca.name AS area_name, ca.code AS area_code,
             ROUND(AVG(r.rating), 2) AS mean_rating, COUNT(r.id) AS response_count
      FROM questions q
      JOIN competence_areas ca ON ca.id = q.competence_area_id
      JOIN responses r ON r.question_id = q.id
      JOIN assessment_attempts at ON at.id = r.attempt_id AND at.status = 'completed'
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE ${scoreScope}
      GROUP BY q.id HAVING COUNT(r.id) >= ? ORDER BY mean_rating ASC, q.question_number ASC LIMIT 5
    `).all(...scoreScopeParams, MIN_REPORT_GROUP_SIZE);

    const recentActivity = req.user.role === 'admin' ? db.prepare(`
      SELECT al.*, u.first_name, u.last_name, u.email, u.role
      FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC LIMIT 10
    `).all() : db.prepare(`
      SELECT al.*, u.first_name, u.last_name, u.email, u.role
      FROM activity_log al LEFT JOIN users u ON u.id = al.user_id
      WHERE al.user_id = ? ORDER BY al.created_at DESC LIMIT 10
    `).all(req.user.id);

    const recentSubmissions = db.prepare(`
      SELECT at.id, at.completed_at, at.overall_mean, at.overall_level, at.scoring_version,
             u.first_name, u.last_name, u.email, asm.title AS assessment_title
      FROM assessment_attempts at
      JOIN users u ON u.id = at.user_id
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'completed' AND ${scope.sql}
      ORDER BY at.completed_at DESC LIMIT 6
    `).all(...scope.params);

    res.json({
      success: true,
      data: {
        summary: {
          totalParticipants,
          totalAssessments,
          completedAttempts,
          inProgressAttempts,
          averageScore: avgScoreRow.avg_score ?? 0,
          standardDeviation,
          scoredAttempts: scoreRows.length,
          completionRate: completedAttempts + inProgressAttempts > 0
            ? Math.round(completedAttempts / (completedAttempts + inProgressAttempts) * 100)
            : 0,
        },
        proficiencyDistribution,
        scoreScaleMax: score.scoreScaleMax,
        isSelfReflection: score.isSelfReflection,
        areaPerformance,
        lowestRatedSkills,
        recentActivity,
        recentSubmissions,
      },
    });
  } catch (err) {
    console.error('Error fetching analytics dashboard:', err);
    res.status(500).json({ success: false, message: 'Failed to generate dashboard analytics' });
  }
});

// GET /api/analytics/demographics - Profile summaries for the caller's cohort
router.get('/demographics', authenticate, authorize('admin'), (req, res) => {
  try {
    const assessmentId = getAssessmentFilter(req, res);
    if (assessmentId === false) return;
    const scope = assessmentScope(req.user, 'asm', assessmentId);
    const score = scoreContext(assessmentId);
    const population = req.user.role === 'admin' && assessmentId === null
      ? "SELECT id AS user_id FROM users WHERE role = 'respondent'"
      : `SELECT DISTINCT aa.user_id FROM assessment_assignments aa
         JOIN scoped_assessments sa ON sa.id = aa.assessment_id`;
    const ctes = `
      WITH scoped_assessments AS (
        SELECT asm.id FROM assessments asm WHERE ${scope.sql}
      ), scoped_respondents AS (${population}),
      scoped_attempts AS (
        SELECT at.user_id, at.overall_mean FROM assessment_attempts at
        JOIN scoped_assessments sa ON sa.id = at.assessment_id
        WHERE at.status = 'completed' AND at.scoring_version = ?
      )
    `;
    const byCategory = (category, groupBy) => db.prepare(`${ctes}
      SELECT ${category} AS category, COUNT(DISTINCT u.id) AS respondent_count,
             ROUND(AVG(at.overall_mean), 2) AS mean_score
      FROM scoped_respondents sr
      JOIN users u ON u.id = sr.user_id
      LEFT JOIN respondent_profiles p ON p.user_id = u.id
      LEFT JOIN scoped_attempts at ON at.user_id = u.id
      GROUP BY ${groupBy} HAVING COUNT(DISTINCT u.id) >= ? ORDER BY category
    `).all(...scope.params, score.scoringVersion, MIN_REPORT_GROUP_SIZE);

    const bySex = byCategory("COALESCE(p.sex, 'Unspecified')", 'COALESCE(p.sex, \'Unspecified\')');
    const ageGroup = `CASE
      WHEN p.age <= 17 THEN '17 and below'
      WHEN p.age BETWEEN 18 AND 20 THEN '18-20'
      WHEN p.age >= 21 THEN '21 above'
      ELSE 'Not specified' END`;
    const byAge = byCategory(ageGroup, ageGroup);
    const byMunicipality = byCategory("COALESCE(p.municipality, 'Unspecified')", 'COALESCE(p.municipality, \'Unspecified\')');
    const municipalityGroup = `CASE
      WHEN p.municipality = 'Masbate City' THEN 'Masbate City'
      WHEN p.municipality LIKE '%Island%' OR p.municipality LIKE '%island%' OR p.municipality LIKE '%Burias%' OR p.municipality LIKE '%Ticao%' THEN 'Island municipality'
      WHEN p.municipality IS NOT NULL AND p.municipality != '' THEN 'Other mainland municipality'
      ELSE 'Unspecified' END`;
    const byMunicipalityGroup = byCategory(municipalityGroup, municipalityGroup);
    const byJuniorSchoolType = byCategory("COALESCE(p.junior_high_school_type, 'Unspecified')", "COALESCE(p.junior_high_school_type, 'Unspecified')");
    const bySeniorSchoolType = byCategory("COALESCE(p.senior_high_school_type, 'Unspecified')", "COALESCE(p.senior_high_school_type, 'Unspecified')");
    const homeAccess = `CASE
      WHEN p.has_computer_at_home = 1 THEN 'With Home PC'
      WHEN p.has_computer_at_home = 0 THEN 'Without Home PC'
      ELSE 'Not specified' END`;
    const byHomeAccess = byCategory(homeAccess, homeAccess);
    const pcInternetAccess = `CASE
      WHEN p.has_computer_at_home IS NULL OR p.internet_access_type IS NULL OR p.internet_access_type = '' THEN 'Not specified'
      WHEN p.has_computer_at_home = 1 AND p.internet_access_type != 'No Internet Access' THEN 'With'
      ELSE 'Without' END`;
    const byPcInternet = byCategory(pcInternetAccess, pcInternetAccess);
    const byInternetAccess = byCategory("COALESCE(p.internet_access_type, 'Unspecified')", "COALESCE(p.internet_access_type, 'Unspecified')");
    const byIncome = byCategory("COALESCE(p.monthly_family_income, 'Unspecified')", 'COALESCE(p.monthly_family_income, \'Unspecified\')');
    const byStrand = byCategory("COALESCE(p.shs_strand, 'Unspecified')", "COALESCE(p.shs_strand, 'Unspecified')");
    return res.json({ success: true, minimumReportGroupSize: MIN_REPORT_GROUP_SIZE, scoreScaleMax: score.scoreScaleMax, isSelfReflection: score.isSelfReflection, data: {
      bySex, byAge, byMunicipality, byMunicipalityGroup, byJuniorSchoolType,
      bySeniorSchoolType, byHomeAccess, byPcInternet, byInternetAccess, byIncome, byStrand,
    } });
  } catch (err) {
    console.error('Error fetching demographic analytics:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate demographic analytics' });
  }
});

// GET /api/analytics/inferential - Thesis profile-group comparisons
router.get('/inferential', authenticate, authorize('admin'), (req, res) => {
  try {
    const assessmentId = getAssessmentFilter(req, res);
    if (assessmentId === false) return;
    const scope = assessmentScope(req.user, 'asm', assessmentId);
    const score = scoreContext(assessmentId);
    const records = db.prepare(`
      SELECT at.overall_mean,
             p.sex,
             CASE
               WHEN p.age <= 17 THEN '17 and below'
               WHEN p.age BETWEEN 18 AND 20 THEN '18-20'
               WHEN p.age >= 21 THEN '21 above'
               ELSE NULL END AS age_group,
             p.municipality,
             CASE
               WHEN p.municipality = 'Masbate City' THEN 'Masbate City'
               WHEN p.municipality LIKE '%Island%' OR p.municipality LIKE '%island%' OR p.municipality LIKE '%Burias%' OR p.municipality LIKE '%Ticao%' THEN 'Island municipality'
               WHEN p.municipality IS NOT NULL AND p.municipality != '' THEN 'Other mainland municipality'
               ELSE NULL END AS municipality_group,
             p.junior_high_school_type AS junior_school_type,
             p.senior_high_school_type AS senior_school_type,
             p.monthly_family_income AS income_group,
             CASE
               WHEN p.has_computer_at_home = 1 THEN 'With computer'
               WHEN p.has_computer_at_home = 0 THEN 'Without computer'
               ELSE NULL END AS home_computer,
             CASE
               WHEN p.has_computer_at_home IS NULL OR p.internet_access_type IS NULL OR p.internet_access_type = '' THEN NULL
               WHEN p.has_computer_at_home = 1 AND p.internet_access_type != 'No Internet Access' THEN 'With'
               ELSE 'Without' END AS home_pc_internet,
             p.internet_access_type AS home_internet
      FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      JOIN respondent_profiles p ON p.user_id = at.user_id
      WHERE at.status = 'completed' AND at.overall_mean IS NOT NULL AND at.scoring_version = ? AND ${scope.sql}
    `).all(score.scoringVersion, ...scope.params);
    const comparisons = buildInferentialComparisons(records);
    return res.json({
      success: true,
      data: {
        alpha: 0.05,
        observationCount: records.length,
        comparisons,
        note: score.isSelfReflection
          ? 'These comparisons use the separate DigCompSAT self-reflection scale (0–3), not the thesis questionnaire. They are exploratory for this local cohort and require adviser review before research interpretation.'
          : 'Parametric tests are used only when the normality and equal-variance checks pass. Otherwise rank-based tests are used. Results describe the selected cohort and should be reviewed with the approved thesis adviser.',
      },
    });
  } catch (err) {
    console.error('Error generating inferential comparisons:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate inferential comparisons' });
  }
});

router.get('/reliability', authenticate, authorize('admin'), (req, res) => {
  const assessmentId = getAssessmentFilter(req, res);
  if (assessmentId === false) return;
  if (assessmentId === null) return res.status(400).json({ success: false, message: 'Select one assessment to calculate questionnaire reliability.' });
  try {
    const assessment = db.prepare('SELECT instrument_snapshot FROM assessments WHERE id = ?').get(assessmentId);
    let snapshot;
    try { snapshot = JSON.parse(assessment?.instrument_snapshot || 'null'); } catch { snapshot = null; }
    const questions = snapshot?.items || [];
    if (!questions.length) return res.status(409).json({ success: false, message: 'This assessment does not have a saved instrument version.' });
    const itemRows = db.prepare(`
      SELECT at.id AS attempt_id, r.question_id, r.rating
      FROM assessment_attempts at JOIN responses r ON r.attempt_id = at.id
      WHERE at.assessment_id = ? AND at.status = 'completed'
    `).all(assessmentId);
    const areas = (snapshot.competenceAreas || [])
      .filter((area) => questions.some((question) => question.competence_area_id === area.id))
      .map((area) => ({
        ...area,
        ...cronbachAlpha(itemRows, questions.filter((question) => question.competence_area_id === area.id).map((question) => question.question_id)),
      }));
    const overall = cronbachAlpha(itemRows, questions.map((question) => question.question_id));
    return res.json({ success: true, data: { overall, areas, interpretation: 'Cronbach’s alpha is a sample-dependent internal-consistency estimate, not evidence of validity. Estimates from small cohorts are unstable; review complete-case counts, questionnaire structure, and the approved analysis plan with the thesis adviser. Confidence intervals are not currently computed.' } });
  } catch (err) {
    console.error('Error calculating questionnaire reliability:', err);
    return res.status(500).json({ success: false, message: 'Unable to calculate questionnaire reliability.' });
  }
});

// GET /api/analytics/desired-skills - De-identified Part III responses
router.get('/desired-skills', authenticate, authorize('admin'), (req, res) => {
  try {
    const assessmentId = getAssessmentFilter(req, res);
    if (assessmentId === false) return;
    const scope = assessmentScope(req.user, 'asm', assessmentId);
    const responses = db.prepare(`
      SELECT 'R' || printf('%04d', ROW_NUMBER() OVER (ORDER BY at.id)) AS respondent_code,
             at.desired_skills_redacted AS response,
             at.completed_at
      FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'completed' AND at.scoring_version = ? AND at.desired_skills_reviewed_at IS NOT NULL
        AND TRIM(COALESCE(at.desired_skills_redacted, '')) != '' AND ${scope.sql}
      ORDER BY at.completed_at ASC, at.id ASC
    `).all(SCORING_VERSION, ...scope.params);
    const pendingReviewCount = req.user.role === 'admin' ? db.prepare(`
      SELECT COUNT(*) AS count FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'completed' AND at.scoring_version = ? AND TRIM(COALESCE(at.desired_skills, '')) != ''
        AND at.desired_skills_reviewed_at IS NULL AND ${scope.sql}
    `).get(SCORING_VERSION, ...scope.params).count : null;
    const cohortSize = db.prepare(`SELECT COUNT(*) AS count FROM assessment_attempts at JOIN assessments asm ON asm.id = at.assessment_id WHERE at.status = 'completed' AND at.scoring_version = ? AND ${scope.sql}`).get(SCORING_VERSION, ...scope.params).count;
    return res.json({ success: true, data: cohortSize >= MIN_REPORT_GROUP_SIZE ? responses : [], pendingReviewCount, minimumReportGroupSize: MIN_REPORT_GROUP_SIZE, suppressedForSmallCohort: cohortSize < MIN_REPORT_GROUP_SIZE });
  } catch (err) {
    console.error('Error retrieving desired-skills responses:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve open-ended responses' });
  }
});

// Raw free-text is restricted to administrators for a manual privacy review before reporting/export.
router.get('/desired-skills/review-queue', authenticate, authorize('admin'), (req, res) => {
  try {
    const assessmentId = getAssessmentFilter(req, res);
    if (assessmentId === false) return;
    const scope = assessmentScope(req.user, 'asm', assessmentId);
    const queue = db.prepare(`
      SELECT at.id AS attempt_id, at.desired_skills AS raw_response,
             at.desired_skills_redacted AS redacted_response, at.completed_at, asm.title AS assessment_title
      FROM assessment_attempts at JOIN assessments asm ON asm.id = at.assessment_id
      WHERE at.status = 'completed' AND at.scoring_version = ? AND TRIM(COALESCE(at.desired_skills, '')) != ''
        AND at.desired_skills_reviewed_at IS NULL AND ${scope.sql}
      ORDER BY at.completed_at ASC, at.id ASC
    `).all(SCORING_VERSION, ...scope.params);
    return res.json({ success: true, data: queue });
  } catch (err) {
    console.error('Error loading free-text privacy review queue:', err);
    return res.status(500).json({ success: false, message: 'Unable to load the privacy review queue.' });
  }
});

router.put('/desired-skills/:attemptId/review', authenticate, authorize('admin'), [
  body('redacted_response').isString().isLength({ max: 1200 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Reviewed response must be 1,200 characters or fewer.' });
  const attemptId = Number.parseInt(req.params.attemptId, 10);
  if (!Number.isInteger(attemptId) || attemptId <= 0) return res.status(400).json({ success: false, message: 'Invalid response ID.' });
  const attempt = db.prepare(`SELECT id, assessment_id, scoring_version FROM assessment_attempts WHERE id = ? AND status = 'completed'`).get(attemptId);
  if (!attempt) return res.status(404).json({ success: false, message: 'Response not found.' });
  if (attempt.scoring_version !== SCORING_VERSION) return res.status(409).json({ success: false, message: 'This instrument does not collect the open-ended Part III response.' });
  if (!canAccessAssessment(req.user, attempt.assessment_id)) return res.status(403).json({ success: false, message: 'Access denied.' });
  const redacted = req.body.redacted_response.trim();
  db.prepare(`UPDATE assessment_attempts SET desired_skills_redacted = ?, desired_skills_reviewed_by = ?, desired_skills_reviewed_at = datetime('now') WHERE id = ?`)
    .run(redacted || null, req.user.id, attemptId);
  logActivity(req.user.id, 'FREE_TEXT_PRIVACY_REVIEW', `Reviewed open-ended response for attempt #${attemptId}`);
  return res.json({ success: true, message: redacted ? 'Sanitized response approved for reporting.' : 'Response withheld from reporting.' });
});

// GET /api/analytics/competence-matrix - Item response distribution by visible cohort
router.get('/competence-matrix', authenticate, authorize('admin'), (req, res) => {
  try {
    const assessmentId = getAssessmentFilter(req, res);
    if (assessmentId === false) return;
    const scope = assessmentScope(req.user, 'asm', assessmentId);
    const score = scoreContext(assessmentId);
    const items = db.prepare(`
      WITH scoped_assessments AS (
        SELECT asm.id FROM assessments asm WHERE ${scope.sql}
      ), scoped_responses AS (
        SELECT r.question_id, r.rating FROM responses r
        JOIN assessment_attempts at ON at.id = r.attempt_id AND at.status = 'completed'
        JOIN scoped_assessments sa ON sa.id = at.assessment_id
      )
      SELECT q.id, q.question_number, q.question_text, q.response_type, q.framework_competence_id,
             ca.name AS area_name, ca.code AS area_code, ca.sort_order,
      CASE WHEN COUNT(r.rating) >= ? THEN ROUND(AVG(r.rating), 2) END AS mean_rating,
      CASE WHEN COUNT(r.rating) >= ? THEN COUNT(r.rating) END AS count_ratings,
      CASE WHEN COUNT(r.rating) >= ? THEN SUM(CASE WHEN r.rating = 4 THEN 1 ELSE 0 END) END AS count_4,
      CASE WHEN COUNT(r.rating) >= ? THEN SUM(CASE WHEN r.rating = 3 THEN 1 ELSE 0 END) END AS count_3,
      CASE WHEN COUNT(r.rating) >= ? THEN SUM(CASE WHEN r.rating = 2 THEN 1 ELSE 0 END) END AS count_2,
      CASE WHEN COUNT(r.rating) >= ? THEN SUM(CASE WHEN r.rating = 1 THEN 1 ELSE 0 END) END AS count_1,
      CASE WHEN COUNT(r.rating) >= ? THEN SUM(CASE WHEN r.rating = 0 THEN 1 ELSE 0 END) END AS count_0,
      CASE WHEN COUNT(r.rating) > 0 AND COUNT(r.rating) < ? THEN 1 ELSE 0 END AS suppressed
      FROM questions q JOIN competence_areas ca ON ca.id = q.competence_area_id
      LEFT JOIN scoped_responses r ON r.question_id = q.id
      WHERE q.instrument_code = ? AND (
        ? = 1 OR EXISTS (
          SELECT 1 FROM assessment_questions aq JOIN scoped_assessments sa ON sa.id = aq.assessment_id
          WHERE aq.question_id = q.id
        )
      )
      GROUP BY q.id ORDER BY ca.sort_order ASC, q.question_number ASC
    `).all(...scope.params, MIN_REPORT_GROUP_SIZE, MIN_REPORT_GROUP_SIZE, MIN_REPORT_GROUP_SIZE, MIN_REPORT_GROUP_SIZE, MIN_REPORT_GROUP_SIZE, MIN_REPORT_GROUP_SIZE, MIN_REPORT_GROUP_SIZE, MIN_REPORT_GROUP_SIZE, score.instrumentCode, req.user.role === 'admin' && assessmentId === null ? 1 : 0);
    return res.json({ success: true, data: items });
  } catch (err) {
    console.error('Error retrieving competence matrix:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve competence matrix' });
  }
});

module.exports = router;
