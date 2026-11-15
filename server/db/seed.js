const bcrypt = require('bcryptjs');
const { db, initializeDatabase, logActivity } = require('./database');
const { initializeInstrument } = require('./instrument');
const { ensureDigCompSatQuestionBank } = require('./digcompsat');

function seed() {
  if (process.env.NODE_ENV === 'production' && process.env.DLAS_FREE_DEMO !== 'true') {
    throw new Error('The demonstration seed is disabled in production. Use the documented bootstrap-admin command on a clean production database.');
  }
  console.log('Initializing database schema...');
  initializeDatabase();
  initializeInstrument(db);
  ensureDigCompSatQuestionBank(db);

  // Check if already seeded
  const existingAdmin = db.prepare("SELECT id FROM users WHERE email = ?").get('admin@dlas.edu.ph');
  if (existingAdmin) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  console.log('Seeding database...');

  const hashedPassword = bcrypt.hashSync('Admin@123', 10);

  // Insert admin user
  const insertUser = db.prepare(`
    INSERT INTO users (email, password, first_name, last_name, role, status) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const adminResult = insertUser.run('admin@dlas.edu.ph', hashedPassword, 'System', 'Administrator', 'admin', 'active');
  const adminId = adminResult.lastInsertRowid;
  console.log('Local demonstration administrator created.');

  const areaIds = Object.fromEntries(db.prepare('SELECT id, code FROM competence_areas').all().map((row) => [row.code, row.id]));
  console.log('The five competence areas and 30 questionnaire items are ready.');

  // Create 3 sample respondent users
  const respondentPassword = bcrypt.hashSync('User@123', 10);

  const respondents = [
    { email: 'maria.santos@example.com', first: 'Maria', last: 'Santos' },
    { email: 'juan.delacruz@example.com', first: 'Juan', last: 'Dela Cruz' },
    { email: 'ana.reyes@example.com', first: 'Ana', last: 'Reyes' },
  ];

  const respondentIds = [];
  for (const r of respondents) {
    const result = insertUser.run(r.email, respondentPassword, r.first, r.last, 'respondent', 'active');
    respondentIds.push(result.lastInsertRowid);
  }
  console.log('3 sample respondent users created.');

  // Create respondent profiles
  const insertProfile = db.prepare(`
    INSERT INTO respondent_profiles (user_id, age, sex, municipality, barangay, junior_high_school, junior_high_school_type, senior_high_school, senior_high_school_type, shs_strand, monthly_family_income, monthly_family_income_amount, has_computer_at_home, internet_access_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const profiles = [
    { userId: respondentIds[0], age: 18, sex: 'Female', municipality: 'Masbate City', barangay: 'Sample Barangay', juniorHs: 'Sample Public Junior High School', juniorType: 'Public', seniorHs: 'Sample Public Senior High School', seniorType: 'Public', strand: 'STEM', income: '10,000-30,000', incomeAmount: 25000, computer: 1, internet: 'Fiber/Broadband' },
    { userId: respondentIds[1], age: 19, sex: 'Male', municipality: 'Aroroy', barangay: 'Sample Barangay', juniorHs: 'Sample Private Junior High School', juniorType: 'Private', seniorHs: 'Sample Private Senior High School', seniorType: 'Private', strand: 'ABM', income: 'below 10,000', incomeAmount: 8500, computer: 1, internet: 'Mobile Data' },
    { userId: respondentIds[2], age: 17, sex: 'Female', municipality: 'Claveria (Burias Island)', barangay: 'Sample Barangay', juniorHs: 'Sample Public Junior High School', juniorType: 'Public', seniorHs: 'Sample Public Senior High School', seniorType: 'Public', strand: 'HUMSS', income: 'above 30,000', incomeAmount: 45000, computer: 0, internet: 'Pocket Wi-Fi' },
  ];

  for (const p of profiles) {
    insertProfile.run(p.userId, p.age, p.sex, p.municipality, p.barangay, p.juniorHs, p.juniorType, p.seniorHs, p.seniorType, p.strand, p.income, p.incomeAmount, p.computer, p.internet);
  }
  console.log('Respondent profiles created.');

  // Create a sample assessment with all 30 questions
  const insertAssessment = db.prepare(`
    INSERT INTO assessments (title, description, created_by, status, time_limit_minutes, consent_required, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const assessmentResult = insertAssessment.run(
    'DEMO — Digital Literacy Assessment 2026–2027',
    'Synthetic local sample records for demonstration only. Replace with consented study responses before reporting findings.',
    adminId,
    'active',
    60,
    1,
    null,
    null
  );
  const assessmentId = assessmentResult.lastInsertRowid;

  // Add all 30 questions to the assessment
  const insertAQ = db.prepare('INSERT INTO assessment_questions (assessment_id, question_id) VALUES (?, ?)');
  const allQuestions = db.prepare("SELECT id FROM questions WHERE instrument_code = 'dlas-thesis-v1' ORDER BY question_number").all();
  for (const q of allQuestions) {
    insertAQ.run(assessmentId, q.id);
  }

  // Assign assessment to all 3 respondents
  const insertAssignment = db.prepare('INSERT INTO assessment_assignments (assessment_id, user_id, assigned_by) VALUES (?, ?, ?)');
  for (const rid of respondentIds) {
    insertAssignment.run(assessmentId, rid, adminId);
  }

  console.log('Sample assessment created and assigned.');

  // Create completed attempts for all 3 respondents with varied ratings
  const insertAttempt = db.prepare(`
    INSERT INTO assessment_attempts (assessment_id, user_id, status, started_at, completed_at, overall_mean, overall_level)
    VALUES (?, ?, 'completed', ?, ?, ?, ?)
  `);

  const insertResponse = db.prepare(`
    INSERT INTO responses (attempt_id, question_id, rating, answered_at) VALUES (?, ?, ?, ?)
  `);

  const insertAreaResult = db.prepare(`
    INSERT INTO area_results (attempt_id, competence_area_id, weighted_mean, standard_deviation, level) VALUES (?, ?, ?, ?, ?)
  `);

  // Helper to get proficiency level
  function getLevel(mean) {
    if (mean <= 1.75) return 'Low';
    if (mean <= 2.50) return 'Moderate';
    if (mean <= 3.25) return 'High';
    return 'Very High';
  }

  // Helper to calculate std dev
  function stdDev(values) {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    return Math.sqrt(variance);
  }

  // Sample ratings for each respondent (30 ratings each)
  const sampleRatings = [
    // Maria - generally high performer
    [3, 4, 3, 4, 3, 3, 4, 4, 3, 4, 4, 3, 4, 4, 3, 3, 4, 4, 4, 3, 4, 3, 4, 4, 3, 2, 3, 4, 3, 4],
    // Juan - moderate performer
    [2, 3, 2, 2, 3, 2, 3, 3, 2, 2, 3, 2, 3, 3, 2, 2, 2, 3, 3, 2, 3, 2, 3, 3, 2, 2, 2, 3, 2, 3],
    // Ana - mixed performer
    [3, 3, 4, 3, 3, 2, 3, 4, 3, 3, 4, 3, 2, 3, 2, 2, 3, 3, 4, 4, 4, 3, 4, 4, 2, 1, 2, 3, 2, 3],
  ];

  const areaCodes = ['IDL', 'CC', 'DCC', 'S', 'PS'];
  const questionsPerArea = 6;

  for (let i = 0; i < respondentIds.length; i++) {
    const ratings = sampleRatings[i];
    const overallMean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const overallLevel = getLevel(overallMean);
    const completedDate = new Date(Date.now() - (respondentIds.length - i - 1) * 24 * 60 * 60 * 1000);
    const startedDate = new Date(completedDate.getTime() - 45 * 60 * 1000);
    const toSqliteUtc = (date) => date.toISOString().replace('T', ' ').slice(0, 19);
    const startedAt = toSqliteUtc(startedDate);
    const completedAt = toSqliteUtc(completedDate);

    const attemptResult = insertAttempt.run(assessmentId, respondentIds[i], startedAt, completedAt, Math.round(overallMean * 100) / 100, overallLevel);
    const attemptId = attemptResult.lastInsertRowid;

    // Insert responses
    for (let j = 0; j < ratings.length; j++) {
      const questionId = allQuestions[j].id;
      insertResponse.run(attemptId, questionId, ratings[j], completedAt);
    }

    // Calculate and insert area results
    for (let a = 0; a < areaCodes.length; a++) {
      const areaRatings = ratings.slice(a * questionsPerArea, (a + 1) * questionsPerArea);
      const areaMean = areaRatings.reduce((s, v) => s + v, 0) / areaRatings.length;
      const areaSD = stdDev(areaRatings);
      const areaLevel = getLevel(areaMean);
      insertAreaResult.run(attemptId, areaIds[areaCodes[a]], Math.round(areaMean * 100) / 100, Math.round(areaSD * 100) / 100, areaLevel);
    }
  }
  console.log('Sample assessment attempts and results created.');

  db.prepare("UPDATE users SET is_demo = 1 WHERE id = ? OR email LIKE '%@example.com'").run(adminId);
  db.prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('demo_mode', '1') ON CONFLICT(setting_key) DO UPDATE SET setting_value = '1', updated_at = datetime('now')").run();

  // Log the seeding activity
  logActivity(adminId, 'DATABASE_SEEDED', 'Initial database seeding completed with admin user, 30 questions, sample respondents, and demo data.');
  require('./knowledgeDemo').seedKnowledgeDemo(db);

  console.log('Database seeding complete!');
}

if (require.main === module) seed();

module.exports = { seed };
