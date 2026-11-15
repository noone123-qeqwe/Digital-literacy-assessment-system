// Full-stack integration checks run against a temporary SQLite database.
// They never seed, log into, or mutate the configured application database.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'dlas-integration-'));
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.DLAS_DB_PATH = path.join(temporaryDirectory, 'system-test.db');
process.env.JWT_SECRET = 'test-only-secret-for-isolated-dlas-suite-2026';
process.env.JWT_EXPIRES_IN = '1h';

const { app, startServer } = require('./server');
const { db } = require('./db/database');
const { seed } = require('./db/seed');
const { calculateAssessmentResults, getProficiencyLevel } = require('./utils/scoring');
const { generateTotpSecret, encryptSecret } = require('./utils/authSecurity');

let passed = 0;
let failed = 0;

function check(condition, title) {
  try {
    assert.ok(condition, title);
    passed += 1;
    console.log(`  PASS ${title}`);
  } catch (error) {
    failed += 1;
    console.error(`  FAIL ${title}: ${error.message}`);
  }
}

function responseCookies(headers) {
  const rawCookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers.get('set-cookie') || ''];
  const cookies = {};
  for (const cookie of rawCookies) {
    for (const match of cookie.matchAll(/(dlas_session|dlas_csrf)=([^;,\s]+)/g)) cookies[match[1]] = match[2];
  }
  return cookies;
}

function totpCode(secret, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const character of secret) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = crypto.createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

async function request(baseUrl, route, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token?.dlas_session) headers.Cookie = Object.entries(token).map(([name, value]) => `${name}=${value}`).join('; ');
  if (token?.dlas_csrf && !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) headers['X-CSRF-Token'] = token.dlas_csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, data, session: responseCookies(response.headers) };
}

async function enrollStaffMfa(baseUrl, email, password) {
  const login = await request(baseUrl, '/auth/login', { method: 'POST', body: { email, password } });
  if (login.status !== 200 || !login.data?.mfaSetupRequired) return { login, setup: null, confirmation: null };
  const setup = await request(baseUrl, '/auth/mfa/setup', {
    method: 'POST', body: { setup_token: login.data.setupToken },
  });
  if (setup.status !== 200 || !setup.data?.data?.secret) return { login, setup, confirmation: null };
  const confirmation = await request(baseUrl, '/auth/mfa/setup/confirm', {
    method: 'POST',
    body: { setup_token: login.data.setupToken, code: totpCode(setup.data.data.secret) },
  });
  return { login, setup, confirmation };
}

async function run() {
  const server = startServer(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    seed();
    console.log('\nDigital Literacy Assessment System integration checks');

    const health = await request(baseUrl, '/health');
    check(health.status === 200 && health.data.status === 'healthy', 'health endpoint responds');

    const adminLogin = await request(baseUrl, '/auth/login', {
      method: 'POST', body: { email: 'admin@dlas.edu.ph', password: 'Admin@123' },
    });
    check(adminLogin.status === 200 && adminLogin.data?.mfaSetupRequired, 'admin sign-in requires authenticator setup');
    const adminMfa = await enrollStaffMfa(baseUrl, 'admin@dlas.edu.ph', 'Admin@123');
    const adminToken = adminMfa.confirmation?.session;
    check(adminMfa.confirmation?.status === 200 && adminToken?.dlas_session && adminToken?.dlas_csrf, 'admin completes MFA setup and receives secure session and CSRF cookies');
    const readiness = await request(baseUrl, '/system/readiness', { token: adminToken });
    check(readiness.status === 200 && readiness.data.data.checks.some((item) => item.id === 'consent') && readiness.data.data.checks.some((item) => item.id === 'backup'), 'administrator can view the safe operational readiness checklist');

    const questions = await request(baseUrl, '/questions?active_only=true', { token: adminToken });
    const areas = await request(baseUrl, '/questions/areas', { token: adminToken });
    check(questions.status === 200 && questions.data.data.length === 30, 'validated 30-item instrument is available');
    check(areas.status === 200 && areas.data.data.length === 5, 'five DigComp domains are available');

    const seededDashboard = await request(baseUrl, '/analytics/dashboard', { token: adminToken });
    check(seededDashboard.status === 200 && seededDashboard.data.data.summary.completedAttempts === 3, 'dashboard totals match seeded completed attempts');
    check(seededDashboard.data.data.areaPerformance.length === 5 && seededDashboard.data.data.summary.standardDeviation >= 0, 'domain means and cohort deviation are computed');

    const demographics = await request(baseUrl, '/analytics/demographics', { token: adminToken });
    const matrix = await request(baseUrl, '/analytics/competence-matrix', { token: adminToken });
    check(demographics.status === 200 && demographics.data.minimumReportGroupSize === 5 && demographics.data.data.bySex.length === 0, 'small demo cohort demographics are suppressed below the privacy threshold');
    check(matrix.status === 200 && matrix.data.data.length === 30, 'item matrix is populated from completed responses');

    const mariaLogin = await request(baseUrl, '/auth/login', {
      method: 'POST', body: { email: 'maria.santos@example.com', password: 'User@123' },
    });
    const mariaToken = mariaLogin.session;
    check(mariaLogin.status === 200 && mariaLogin.data?.success && mariaToken.dlas_session && mariaToken.dlas_csrf, 'respondent login issues secure session and CSRF cookies');
    const mariaAttempts = await request(baseUrl, '/attempts/my', { token: mariaToken });
    const sampleAttemptId = mariaAttempts.data?.data?.find((attempt) => attempt.status === 'completed')?.id;
    const sampleResults = await request(baseUrl, `/attempts/${sampleAttemptId}/results`, { token: mariaToken });
    check(Boolean(sampleAttemptId) && sampleResults.status === 200 && sampleResults.data.data.areaResults.length === 5, 'respondent can view own completed results');

    const missingAuthResults = await request(baseUrl, '/users/2/results');
    check(missingAuthResults.status === 401, 'user result endpoint rejects unauthenticated requests');

    const escalation = await request(baseUrl, '/auth/register', {
      method: 'POST',
      body: { first_name: 'Escalation', last_name: 'Attempt', email: 'role-attack@example.test', password: 'LongTestPass123!', role: 'admin' },
    });
    check(escalation.status === 400, 'public registration cannot request elevated roles');

    const registration = await request(baseUrl, '/auth/register', {
      method: 'POST',
      body: { first_name: 'Jamie', last_name: 'Student', email: 'jamie@example.test', password: 'SecureTestPass123!', role: 'respondent', institutional_id: '2026-0001' },
    });
    check(registration.status === 201 && registration.data?.verificationRequired, 'registration requires email verification before login');
    check(db.prepare('SELECT institutional_id FROM users WHERE id = ?').get(registration.data.data.user.id).institutional_id === '2026-0001', 'optional student ID is saved in normalized form for roster matching');
    const duplicateStudentId = await request(baseUrl, '/auth/register', { method: 'POST', body: { first_name: 'Another', last_name: 'Student', email: 'duplicate-id@example.test', password: 'SecureTestPass789!', institutional_id: '2026-0001' } });
    check(duplicateStudentId.status === 409 && duplicateStudentId.data.message.includes('Student ID'), 'duplicate optional student IDs are rejected clearly');
    const secondRegistration = await request(baseUrl, '/auth/register', {
      method: 'POST',
      body: { first_name: 'Taylor', last_name: 'Student', email: 'taylor@example.test', password: 'SecureTestPass456!' },
    });
    check(registration.status === 201 && registration.data?.data?.user?.id && secondRegistration.status === 201 && secondRegistration.data?.data?.user?.id, 'respondent registration creates unverified accounts without exposing session tokens');
    const preVerificationLogin = await request(baseUrl, '/auth/login', {
      method: 'POST', body: { email: 'jamie@example.test', password: 'SecureTestPass123!' },
    });
    check(preVerificationLogin.status === 403 && preVerificationLogin.data?.verificationRequired, 'unverified respondent cannot sign in');
    db.prepare('UPDATE users SET email_verified = 1 WHERE id IN (?, ?)').run(
      registration.data.data.user.id,
      secondRegistration.data.data.user.id
    );
    const studentLogin = await request(baseUrl, '/auth/login', {
      method: 'POST', body: { email: 'jamie@example.test', password: 'SecureTestPass123!' },
    });
    const studentToken = studentLogin.session;
    const secondStudentLogin = await request(baseUrl, '/auth/login', {
      method: 'POST', body: { email: 'taylor@example.test', password: 'SecureTestPass456!' },
    });
    const secondStudentToken = secondStudentLogin.session;
    check(studentLogin.status === 200 && studentToken.dlas_session && secondStudentLogin.status === 200 && secondStudentToken.dlas_session, 'verified respondents can sign in using secure cookie sessions');

    const unassigned = await request(baseUrl, '/attempts', { method: 'POST', token: studentToken, body: { assessment_id: 1 } });
    check(unassigned.status === 403, 'respondents cannot start unassigned assessments');

    const createAssessment = await request(baseUrl, '/assessments', {
      method: 'POST', token: adminToken,
      body: {
        title: 'Integration Assessment', description: 'Isolated full-stack test', time_limit_minutes: 30,
        max_attempts: 2,
        question_ids: questions.data.data.map((question) => question.id),
        assigned_user_ids: [registration.data.data.user.id],
      },
    });
    const assessmentId = createAssessment.data?.data?.id;
    check(createAssessment.status === 201 && assessmentId, 'assessment and assignments are created together');

    const assessmentDetails = await request(baseUrl, `/assessments/${assessmentId}`, { token: studentToken });
    check(assessmentDetails.status === 200 && assessmentDetails.data.data.questions.length === 30, 'assigned respondent receives the assessment questions');
    const deniedDetails = await request(baseUrl, `/assessments/${assessmentId}`, { token: secondStudentToken });
    check(deniedDetails.status === 403, 'unassigned respondent cannot read assessment questions');

    const consentGate = await request(baseUrl, '/attempts', {
      method: 'POST', token: studentToken, body: { assessment_id: assessmentId },
    });
    check(consentGate.status === 428 && consentGate.data.consentRequired, 'assigned respondent must consent before beginning research assessment');
    const adultConsent = await request(baseUrl, `/consents/${assessmentId}`, {
      method: 'POST', token: studentToken,
      body: { participant_name: 'Jamie Student', participant_age: 18, participant_confirmed: true },
    });
    const incompleteProfileGate = await request(baseUrl, '/attempts', {
      method: 'POST', token: studentToken, body: { assessment_id: assessmentId },
    });
    check(adultConsent.status === 200 && !adultConsent.data.guardianVerificationPending && incompleteProfileGate.status === 428 && incompleteProfileGate.data.profileRequired, 'adult consent is recorded and the system then requires the study profile');
    const completedProfile = await request(baseUrl, '/auth/me', {
      method: 'PUT', token: studentToken,
      body: {
        age: 18, sex: 'Prefer not to say', municipality: 'Masbate City', barangay: 'Test Barangay',
        junior_high_school: 'Test Junior High School', junior_high_school_type: 'Public',
        senior_high_school: 'Test Senior High School', senior_high_school_type: 'Public', shs_strand: 'STEM',
        monthly_family_income_amount: 25000, has_computer_at_home: 1, internet_access_type: 'Fiber/Broadband',
      },
    });
    check(completedProfile.status === 200 && completedProfile.data.data.profile.profile_consent_version, 'respondent can save a complete profile after consent');

    const start = await request(baseUrl, '/attempts', { method: 'POST', token: studentToken, body: { assessment_id: assessmentId } });
    const attemptId = start.data?.data?.attempt?.id;
    const firstQuestion = start.data?.data?.questions?.[0]?.id;
    const secondQuestion = start.data?.data?.questions?.[1]?.id;
    check(start.status === 200 && attemptId && start.data.data.questions.length === 30, 'assigned respondent can start an attempt');

    const badQuestion = await request(baseUrl, `/attempts/${attemptId}/respond`, {
      method: 'PUT', token: studentToken, body: { question_id: 999999, rating: 4 },
    });
    const badRating = await request(baseUrl, `/attempts/${attemptId}/respond`, {
      method: 'PUT', token: studentToken, body: { question_id: firstQuestion, rating: 5 },
    });
    check(badQuestion.status === 400 && badRating.status === 400, 'responses reject foreign questions and ratings outside 1–4');

    await request(baseUrl, `/attempts/${attemptId}/respond`, {
      method: 'PUT', token: studentToken, body: { question_id: firstQuestion, rating: 4 },
    });
    const updateResponse = await request(baseUrl, `/attempts/${attemptId}/respond`, {
      method: 'PUT', token: studentToken, body: { question_id: firstQuestion, rating: 3 },
    });
    await request(baseUrl, `/attempts/${attemptId}/respond`, {
      method: 'PUT', token: studentToken, body: { question_id: secondQuestion, rating: 3 },
    });
    check(updateResponse.status === 200 && updateResponse.data.answeredCount === 1, 'autosave updates an existing answer without duplicating it');

    const crossAttempt = await request(baseUrl, `/attempts/${attemptId}`, { token: secondStudentToken });
    const crossResult = await request(baseUrl, `/attempts/${attemptId}/results`, { token: secondStudentToken });
    const crossExcel = await request(baseUrl, `/export/results/${attemptId}/excel`, { token: secondStudentToken });
    const crossPdf = await request(baseUrl, `/export/results/${attemptId}/pdf`, { token: secondStudentToken });
    check([crossAttempt.status, crossResult.status, crossExcel.status, crossPdf.status].every((status) => status === 403), 'respondents cannot read another person’s attempt, results, or exports');

    const partialSubmission = await request(baseUrl, `/attempts/${attemptId}/submit`, { method: 'POST', token: studentToken });
    check(partialSubmission.status === 400 && partialSubmission.data.answeredCount === 2 && partialSubmission.data.totalCount === 30, 'partial submissions remain in progress and cannot produce a score');
    const remainingResponses = start.data.data.questions.slice(2).map((question) => ({ question_id: question.id, rating: 3 }));
    const completeBatch = await request(baseUrl, `/attempts/${attemptId}/respond`, {
      method: 'PUT', token: studentToken, body: { responses: remainingResponses },
    });
    check(completeBatch.status === 200 && completeBatch.data.answeredCount === 30, 'a batch can complete the full questionnaire atomically');
    const historicalQuestionEdit = await request(baseUrl, `/questions/${firstQuestion}`, {
      method: 'PUT', token: adminToken, body: { question_text: 'Changed after attempt start' },
    });
    const timerChangeDuringAttempt = await request(baseUrl, `/assessments/${assessmentId}`, {
      method: 'PUT', token: adminToken, body: { time_limit_minutes: 20 },
    });
    check(historicalQuestionEdit.status === 409, 'question meaning cannot change after an attempt has started');
    check(timerChangeDuringAttempt.status === 409, 'time limit cannot change while participants have active attempts');
    const submission = await request(baseUrl, `/attempts/${attemptId}/submit`, { method: 'POST', token: studentToken });
    check(submission.status === 200 && submission.data.data.overallMean === 3 && submission.data.data.overallLevel === 'High', 'complete responses preserve the approved proficiency calculation');
    const detailedResult = await request(baseUrl, `/attempts/${attemptId}/results`, { token: studentToken });
    check(detailedResult.status === 200 && detailedResult.data.data.areaResults.every((area) => area.weighted_mean === 3), 'complete results include valid means for each represented domain');
    const repeatSubmission = await request(baseUrl, `/attempts/${attemptId}/submit`, { method: 'POST', token: studentToken });
    check(repeatSubmission.status === 200, 'repeat submission returns the saved result idempotently');

    const filteredDashboard = await request(baseUrl, `/analytics/dashboard?assessment_id=${assessmentId}`, { token: adminToken });
    const filteredDemographics = await request(baseUrl, `/analytics/demographics?assessment_id=${assessmentId}`, { token: adminToken });
    const filteredMatrix = await request(baseUrl, `/analytics/competence-matrix?assessment_id=${assessmentId}`, { token: adminToken });
    const invalidAnalyticsFilter = await request(baseUrl, '/analytics/dashboard?assessment_id=invalid', { token: adminToken });
    check(filteredDashboard.status === 200 && filteredDashboard.data.data.summary.totalAssessments === 1 && filteredDashboard.data.data.summary.completedAttempts === 1 && filteredDashboard.data.data.summary.totalParticipants === 1, 'dashboard analytics can be scoped to one assessment');
    check(filteredDemographics.status === 200 && filteredDemographics.data.minimumReportGroupSize === 5 && filteredDemographics.data.data.byAge.length === 0, 'demographic summaries suppress the selected cohort below the privacy threshold');
    check(filteredMatrix.status === 200 && filteredMatrix.data.data.length === 30 && filteredMatrix.data.data.every((item) => item.suppressed === 1 && item.count_ratings === null), 'item response matrix suppresses ratings for cohorts below five participants');
    check(invalidAnalyticsFilter.status === 400, 'analytics filters reject invalid assessment IDs');

    const ownExcel = await request(baseUrl, `/export/results/${attemptId}/excel`, { token: studentToken });
    const ownPdf = await request(baseUrl, `/export/results/${attemptId}/pdf`, { token: studentToken });
    check(ownExcel.status === 200 && ownExcel.data.length > 1000, 'authorized individual Excel export is generated');
    check(ownPdf.status === 200 && ownPdf.data.length > 1000, 'authorized individual PDF export is generated');

    const profileWrite = await request(baseUrl, '/auth/me', {
      method: 'PUT', token: studentToken, body: { age: 18, municipality: 'Masbate City', has_computer_at_home: 1 },
    });
    const profileClear = await request(baseUrl, '/auth/me', {
      method: 'PUT', token: studentToken, body: { municipality: '' },
    });
    check(profileWrite.status === 200 && profileClear.data.data.profile.municipality === null, 'profile updates validate and can clear a saved field');

    const ownUserResults = await request(baseUrl, `/users/${registration.data.data.user.id}/results`, { token: studentToken });
    const otherUserResults = await request(baseUrl, `/users/${registration.data.data.user.id}/results`, { token: secondStudentToken });
    check(ownUserResults.status === 200 && ownUserResults.data.data.length === 1, 'respondent can retrieve own result history');
    check(otherUserResults.status === 403, 'respondent cannot retrieve another user’s result history');

    await request(baseUrl, '/auth/me', { method: 'PUT', token: studentToken, body: { municipality: 'Masbate City' } });

    const nextAttempt = await request(baseUrl, '/attempts', { method: 'POST', token: studentToken, body: { assessment_id: assessmentId } });
    const nextAttemptId = nextAttempt.data?.data?.attempt?.id;
    const nextAttemptAnswers = nextAttempt.data?.data?.questions?.map((question) => ({ question_id: question.id, rating: 4 })) || [];
    const nextAttemptSave = await request(baseUrl, `/attempts/${nextAttemptId}/respond`, { method: 'PUT', token: studentToken, body: { responses: nextAttemptAnswers } });
    const nextAttemptSubmit = await request(baseUrl, `/attempts/${nextAttemptId}/submit`, { method: 'POST', token: studentToken });
    const exhaustedAttempt = await request(baseUrl, '/attempts', { method: 'POST', token: studentToken, body: { assessment_id: assessmentId } });
    check(nextAttempt.status === 200 && nextAttemptId && nextAttemptId !== attemptId && nextAttemptSave.status === 200 && nextAttemptSubmit.status === 200, `configured assessment limits allow a second snapshotted attempt (${nextAttempt.status}/${nextAttemptId || 'no id'}, save ${nextAttemptSave.status}, submit ${nextAttemptSubmit.status})`);
    check(exhaustedAttempt.status === 200 && exhaustedAttempt.data.data.alreadyCompleted && exhaustedAttempt.data.data.attempt.id === nextAttemptId, `assessment attempt limit returns the latest result after the final attempt (${exhaustedAttempt.status}/${exhaustedAttempt.data?.data?.alreadyCompleted})`);

    const rosterAssessment = await request(baseUrl, '/assessments', {
      method: 'POST', token: adminToken,
      body: { title: 'Roster Import Check', question_ids: [firstQuestion], consent_required: false },
    });
    const rosterImport = await request(baseUrl, '/users/import-roster', {
      method: 'POST', token: adminToken,
      body: { assessment_id: rosterAssessment.data.data.id, rows: [
        { email: 'jamie@example.test', student_id: '2026-0001' },
        { email: 'unknown@example.test', student_id: 'UNKNOWN-1' },
      ] },
    });
    check(rosterAssessment.status === 201 && rosterImport.status === 200 && rosterImport.data.data.assignedCount === 1 && rosterImport.data.data.skippedCount === 1, 'roster import assigns verified accounts and reports unmatched rows');

    const learningModule = await request(baseUrl, '/learning/modules', { method: 'POST', token: adminToken, body: {
      competence_area_id: areas.data.data[0].id,
      title: 'Test information skills', description: 'An approved sample resource for the isolated integration suite.',
      resource_url: 'https://example.edu/digital-literacy', estimated_minutes: 12, is_published: true,
    } });
    const studentLearning = await request(baseUrl, '/learning/modules', { token: studentToken });
    const completeLearning = await request(baseUrl, `/learning/modules/${learningModule.data.data.id}/complete`, { method: 'POST', token: studentToken });
    const completedLearning = await request(baseUrl, '/learning/modules', { token: studentToken });
    check(learningModule.status === 201 && studentLearning.status === 200 && studentLearning.data.data.some((item) => item.id === learningModule.data.data.id), 'administrator can publish a learning resource for the matching domain');
    check(completeLearning.status === 200 && completedLearning.data.data.find((item) => item.id === learningModule.data.data.id)?.completed === 1, 'student can save learning-resource completion progress');

    const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const scheduled = await request(baseUrl, '/assessments', {
      method: 'POST', token: adminToken,
      body: { title: 'Scheduled Assessment', question_ids: [firstQuestion], assigned_user_ids: [registration.data.data.user.id], start_date: futureStart, end_date: futureEnd, consent_required: false },
    });
    const scheduledAttempt = await request(baseUrl, '/attempts', {
      method: 'POST', token: studentToken, body: { assessment_id: scheduled.data.data.id },
    });
    check(scheduled.status === 201 && scheduledAttempt.status === 400, 'future assessments cannot be started early');

    const assessorCreate = await request(baseUrl, '/users', {
      method: 'POST', token: adminToken,
      body: { first_name: 'Avery', last_name: 'Assessor', email: 'assessor@example.test', password: 'SecureAssessor123!', role: 'assessor' },
    });
    db.prepare("UPDATE users SET email_verified = 1 WHERE email = 'assessor@example.test'").run();
    const assessorMfa = await enrollStaffMfa(baseUrl, 'assessor@example.test', 'SecureAssessor123!');
    const assessorToken = assessorMfa.confirmation?.session;
    const assessorDirectory = await request(baseUrl, '/users?role=respondent&status=active', { token: assessorToken });
    const assessorAssessment = await request(baseUrl, '/assessments', {
      method: 'POST', token: assessorToken,
      body: { title: 'Assessor Cohort', time_limit_minutes: 1, question_ids: [firstQuestion], assigned_user_ids: [secondRegistration.data.data.user.id], consent_required: false },
    });
    const assessorDashboard = await request(baseUrl, '/analytics/dashboard', { token: assessorToken });
    const assessorScopedDashboard = await request(baseUrl, `/analytics/dashboard?assessment_id=${assessorAssessment.data.data.id}`, { token: assessorToken });
    const assessorForeignAnalytics = await request(baseUrl, '/analytics/dashboard?assessment_id=1', { token: assessorToken });
    const assessorForeignResults = await request(baseUrl, '/assessments/1/results', { token: assessorToken });
    const assessorForeignExport = await request(baseUrl, '/export/assessment/1/excel', { token: assessorToken });
    check(assessorCreate.status === 201 && assessorMfa.confirmation?.status === 200 && assessorAssessment.status === 201, 'administrator can provision an assessor who enrolls MFA and manages a cohort');
    const assessorDirectoryUser = assessorDirectory.data?.data?.users?.[0];
    check(assessorDirectory.status === 200 && assessorDirectoryUser && !Object.hasOwn(assessorDirectoryUser, 'age') && !Object.hasOwn(assessorDirectoryUser, 'municipality') && !Object.hasOwn(assessorDirectoryUser, 'completed_assessments'), 'assessor directory omits respondent demographics and account history');
    check(assessorDashboard.status === 200 && assessorDashboard.data.data.summary.totalAssessments === 1 && assessorDashboard.data.data.summary.totalParticipants === 1, 'assessor dashboard is limited to their own cohort');
    check(assessorScopedDashboard.status === 200 && assessorScopedDashboard.data.data.summary.totalAssessments === 1 && assessorForeignAnalytics.status === 403, 'assessment analytics filters enforce assessor cohort access');
    check(assessorForeignResults.status === 403 && assessorForeignExport.status === 403, 'assessor cannot inspect or export an unrelated cohort');

    const timedAssessment = await request(baseUrl, `/assessments/${assessorAssessment.data.data.id}`, { token: assessorToken });
    const timedAttemptStart = await request(baseUrl, '/attempts', {
      method: 'POST', token: secondStudentToken, body: { assessment_id: assessorAssessment.data.data.id },
    });
    const timedAttemptId = timedAttemptStart.data?.data?.attempt?.id;
    const timedQuestionId = timedAttemptStart.data?.data?.questions?.[0]?.id;
    await request(baseUrl, `/attempts/${timedAttemptId}/respond`, {
      method: 'PUT', token: secondStudentToken, body: { question_id: timedQuestionId, rating: 4 },
    });
    db.prepare("UPDATE assessment_attempts SET started_at = datetime('now', '-2 minutes') WHERE id = ?").run(timedAttemptId);
    const expiredSave = await request(baseUrl, `/attempts/${timedAttemptId}/respond`, {
      method: 'PUT', token: secondStudentToken, body: { question_id: timedQuestionId, rating: 2 },
    });
    const reopen = await request(baseUrl, `/attempts/${timedAttemptId}/reopen`, { method: 'POST', token: assessorToken });
    const resumedTimedAttempt = await request(baseUrl, `/attempts/${timedAttemptId}`, { token: secondStudentToken });
    check(timedAssessment.status === 200 && timedAttemptId && expiredSave.status === 410, 'expired attempts stop accepting new responses but keep saved data');
    check(reopen.status === 200 && resumedTimedAttempt.data.data.questions[0].saved_rating === 4, 'assessment owner can restart an expired timer without losing saved answers');

    const cohortExport = await request(baseUrl, `/export/assessment/${assessmentId}/excel`, { token: adminToken });
    check(cohortExport.status === 409 && cohortExport.data.message.includes('at least five completed participants'), 'research cohort export is withheld below the five-participant threshold');

    check(getProficiencyLevel(1.75) === 'Low' && getProficiencyLevel(1.76) === 'Moderate' && getProficiencyLevel(3.26) === 'Very High', 'proficiency cutoffs match the approved scale');
    const partialScore = calculateAssessmentResults(
      [{ question_id: 1, rating: 4, competence_area_id: 1 }],
      [{ id: 1, name: 'Information', code: 'IDL' }, { id: 2, name: 'Safety', code: 'S' }]
    );
    check(partialScore.areaResults[1].level === 'N/A' && partialScore.strengths.length === 1, 'scoring handles empty domains without assigning a false low score');

    process.env.BACKUP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    process.env.BACKUP_DIRECTORY = path.join(temporaryDirectory, 'protected-backups');
    const { createEncryptedBackup } = require('./db/backup');
    const { verifyBackup } = require('./db/verify-backup');
    const encryptedBackup = await createEncryptedBackup();
    const verifiedBackup = verifyBackup(encryptedBackup);
    check(verifiedBackup.integrity === 'ok' && verifiedBackup.tableCount > 0, 'encrypted backup verifier checks a temporary snapshot without modifying the live test database');
    const { restore } = require('./db/restore');
    const rehearsalDirectory = path.join(temporaryDirectory, 'restore-rehearsal');
    const rehearsalDatabasePath = path.join(rehearsalDirectory, 'rehearsal.sqlite');
    fs.mkdirSync(rehearsalDirectory, { recursive: true });
    const { DatabaseSync } = require('node:sqlite');
    const oldDatabase = new DatabaseSync(rehearsalDatabasePath);
    oldDatabase.exec('CREATE TABLE rehearsal_sentinel (value TEXT); INSERT INTO rehearsal_sentinel VALUES (\'previous database\');');
    oldDatabase.close();
    await restore(encryptedBackup, rehearsalDatabasePath);
    const restoredDatabase = new DatabaseSync(rehearsalDatabasePath);
    const restoredUsers = restoredDatabase.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    restoredDatabase.close();
    const preservedFile = fs.readdirSync(rehearsalDirectory).find((name) => name.startsWith('rehearsal.sqlite.pre-restore-'));
    const preservedDatabase = preservedFile ? new DatabaseSync(path.join(rehearsalDirectory, preservedFile)) : null;
    const preservedSentinel = preservedDatabase?.prepare('SELECT value FROM rehearsal_sentinel').get()?.value;
    preservedDatabase?.close();
    check(restoredUsers > 0 && preservedSentinel === 'previous database', 'restore rehearsal recovers the snapshot and preserves the prior database in an isolated temporary folder');

    // Exhaust the isolated login limiter after all valid logins have completed.
    let rateLimited = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await request(baseUrl, '/auth/login', {
        method: 'POST', body: { email: 'wrong@example.test', password: 'wrong-password' },
      });
      if (response.status === 429) rateLimited = true;
    }
    check(rateLimited, 'repeated sign-in failures are rate limited');

    const duplicateAnswerCount = db.prepare('SELECT COUNT(*) AS count FROM responses WHERE attempt_id = ?').get(attemptId).count;
    check(duplicateAnswerCount === 30, 'database contains one row for every answered question');
  } catch (error) {
    failed += 1;
    console.error(`  FAIL unexpected integration error: ${error.stack || error.message}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
    const resolvedTemp = path.resolve(temporaryDirectory);
    const resolvedPrefix = path.resolve(os.tmpdir());
    if (!resolvedTemp.startsWith(`${resolvedPrefix}${path.sep}`)) {
      throw new Error('Refusing to remove a path outside the temporary test directory');
    }
    fs.rmSync(resolvedTemp, { recursive: true, force: true });
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
