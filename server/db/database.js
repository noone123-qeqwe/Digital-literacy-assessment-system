const { databaseConfiguration, openDatabase } = require('./connection');
const databaseConfig = databaseConfiguration();
const dbPath = databaseConfig.dbPath;
const db = openDatabase(databaseConfig);

const SCORING_VERSION = 'dlas-mean-1.0';
const DIGCOMPSAT_SCORING_VERSION = 'digcompsat-self-reflection-0-3.1';
const DLAS_INSTRUMENT_CODE = 'dlas-thesis-v1';
const DIGCOMPSAT_INSTRUMENT_CODE = 'digcompsat-2020';

function buildAssessmentSnapshot(questionIds) {
  if (!Array.isArray(questionIds) || questionIds.length === 0) return null;
  const uniqueIds = [...new Set(questionIds.map(Number))];
  const items = db.prepare(`
    SELECT q.id AS id, q.id AS question_id, q.question_number, q.question_text,
           q.instrument_code, q.response_type, q.proficiency_level,
           q.framework_competence_id,
           ca.id AS competence_area_id, ca.name AS area_name, ca.code AS area_code,
           ca.sort_order AS area_sort_order
    FROM questions q JOIN competence_areas ca ON ca.id = q.competence_area_id
    WHERE q.id IN (${uniqueIds.map(() => '?').join(',')})
    ORDER BY ca.sort_order ASC, q.question_number ASC
  `).all(...uniqueIds);
  if (items.length !== uniqueIds.length) return null;
  const instrumentCodes = new Set(items.map((item) => item.instrument_code || DLAS_INSTRUMENT_CODE));
  if (instrumentCodes.size !== 1) return null;
  const instrumentCode = [...instrumentCodes][0];
  if (![DLAS_INSTRUMENT_CODE, DIGCOMPSAT_INSTRUMENT_CODE].includes(instrumentCode)) return null;
  if (instrumentCode === DIGCOMPSAT_INSTRUMENT_CODE && items.some((item) => !['knowledge', 'skills', 'attitude'].includes(item.response_type))) return null;
  const isDigCompSat = instrumentCode === DIGCOMPSAT_INSTRUMENT_CODE;
  return {
    instrumentCode,
    instrumentVersion: isDigCompSat ? 'DigCompSAT-2020-final-english' : 1,
    instrumentName: isDigCompSat ? 'DigCompSAT self-reflection item bank (English)' : 'Masbate Colleges Digital Literacy Assessment',
    scoringVersion: isDigCompSat ? DIGCOMPSAT_SCORING_VERSION : SCORING_VERSION,
    scoreScale: isDigCompSat ? { min: 0, max: 3, description: 'Self-reported knowledge, skill, or attitude; higher values indicate greater self-reported confidence or capability.' } : { min: 1, max: 4, description: 'Thesis questionnaire mean-rating scale.' },
    responseScales: isDigCompSat ? {
      knowledge: [
        { value: 0, label: 'I have no knowledge of this / I never heard of this.' },
        { value: 1, label: 'I have only a limited understanding of this and need more explanations.' },
        { value: 2, label: 'I have a good understanding of this.' },
        { value: 3, label: 'I fully master this topic or issue and could explain it to others.' },
      ],
      skills: [
        { value: 0, label: 'I don’t know how to do it.' },
        { value: 1, label: 'I can do it with help.' },
        { value: 2, label: 'I can do it on my own.' },
        { value: 3, label: 'I can do it with confidence and, if needed, I can support or guide others.' },
      ],
      attitude: [
        { value: 0, label: 'Not at all.' },
        { value: 1, label: 'Not much / very little.' },
        { value: 2, label: 'Yes / Yes, I am / Yes, I do.' },
        { value: 3, label: 'Very much.' },
      ],
    } : null,
    proficiencyCutoffs: isDigCompSat ? [] : [
      { min: 1, max: 1.75, level: 'Low' },
      { min: 1.76, max: 2.5, level: 'Moderate' },
      { min: 2.51, max: 3.25, level: 'High' },
      { min: 3.26, max: 4, level: 'Very High' },
    ],
    capturedAt: new Date().toISOString(),
    competenceAreas: db.prepare('SELECT id, name, code, description, sort_order FROM competence_areas ORDER BY sort_order ASC').all(),
    items,
  };
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'respondent',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS respondent_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE REFERENCES users(id),
      age INTEGER,
      sex TEXT,
      municipality TEXT,
      barangay TEXT,
      junior_high_school TEXT,
      junior_high_school_type TEXT,
      senior_high_school TEXT,
      senior_high_school_type TEXT,
      shs_strand TEXT,
      monthly_family_income TEXT,
      monthly_family_income_amount INTEGER,
      has_computer_at_home INTEGER,
      internet_access_type TEXT,
      profile_consent_version TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_pictures (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
      image_data BLOB NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS competence_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      sort_order INTEGER
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competence_area_id INTEGER REFERENCES competence_areas(id),
      question_number INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      instrument_code TEXT NOT NULL DEFAULT 'dlas-thesis-v1',
      response_type TEXT,
      proficiency_level TEXT,
      framework_competence_id TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      created_by INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'active',
      time_limit_minutes INTEGER,
      consent_required INTEGER NOT NULL DEFAULT 0 CHECK (consent_required IN (0, 1)),
      start_date DATETIME,
      end_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assessment_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER REFERENCES assessments(id),
      question_id INTEGER REFERENCES questions(id)
    );

    CREATE TABLE IF NOT EXISTS assessment_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER REFERENCES assessments(id),
      user_id INTEGER REFERENCES users(id),
      assigned_by INTEGER REFERENCES users(id),
      assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS assessment_consents (
      assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('consented', 'withdrawn')),
      participant_name TEXT NOT NULL,
      participant_confirmed INTEGER NOT NULL CHECK (participant_confirmed IN (0, 1)),
      guardian_name TEXT,
      guardian_relationship TEXT,
      guardian_email TEXT,
      guardian_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (guardian_confirmed IN (0, 1)),
      guardian_email_verified INTEGER NOT NULL DEFAULT 0 CHECK (guardian_email_verified IN (0, 1)),
      participant_age INTEGER,
      consent_version TEXT NOT NULL,
      consent_text_snapshot TEXT,
      assent_text_snapshot TEXT,
      guardian_consent_text_snapshot TEXT,
      consented_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      withdrawn_at DATETIME,
      PRIMARY KEY (assessment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS assessment_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER REFERENCES assessments(id),
      user_id INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'in_progress',
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      overall_mean REAL,
      overall_level TEXT,
      desired_skills TEXT,
      integrity_confirmed_at DATETIME,
      integrity_statement_version TEXT
    );

    CREATE TABLE IF NOT EXISTS responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER REFERENCES assessment_attempts(id),
      question_id INTEGER REFERENCES questions(id),
      rating INTEGER CHECK(rating >= 0 AND rating <= 4),
      answered_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS area_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER REFERENCES assessment_attempts(id),
      competence_area_id INTEGER REFERENCES competence_areas(id),
      weighted_mean REAL,
      standard_deviation REAL,
      level TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      bucket_key TEXT PRIMARY KEY,
      hit_count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_agent TEXT,
      ip_address TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      token_type TEXT NOT NULL CHECK (token_type IN ('email_verification', 'password_reset')),
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mfa_recovery_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS mfa_challenges (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      challenge_type TEXT NOT NULL CHECK (challenge_type IN ('login', 'setup')),
      secret_encrypted TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS guardian_consent_tokens (
      assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      used_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (assessment_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_questions_area ON questions(competence_area_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_questions_assessment ON assessment_questions(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_assignments_assessment ON assessment_assignments(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_assignments_user ON assessment_assignments(user_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_assessment ON assessment_attempts(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON assessment_attempts(user_id);
    CREATE INDEX IF NOT EXISTS idx_responses_attempt ON responses(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_area_results_attempt ON area_results(attempt_id);
    CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_reset ON rate_limit_buckets(reset_at);
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id, revoked_at, expires_at);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_type ON auth_tokens(user_id, token_type, expires_at);
  `);

  // These natural keys keep concurrent requests from creating duplicate records.
  // Check first so a legacy database with duplicates can still start; callers
  // also use transactions and handle conflicts explicitly.
  const uniqueIndexes = [
    ['uq_questions_area_number', 'questions', 'competence_area_id, question_number'],
    ['uq_assessment_questions_pair', 'assessment_questions', 'assessment_id, question_id'],
    ['uq_assessment_assignments_pair', 'assessment_assignments', 'assessment_id, user_id'],
    ['uq_responses_attempt_question', 'responses', 'attempt_id, question_id'],
    ['uq_area_results_attempt_area', 'area_results', 'attempt_id, competence_area_id'],
  ];
  for (const [indexName, tableName, columns] of uniqueIndexes) {
    if (indexName === 'uq_questions_area_number' && db.prepare('SELECT 1 FROM schema_migrations WHERE version=8').get()) continue;
    const duplicates = db.prepare(`
      SELECT 1 FROM ${tableName} GROUP BY ${columns} HAVING COUNT(*) > 1 LIMIT 1
    `).get();
    if (!duplicates) {
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns});`);
    } else {
      console.warn(`Skipped ${indexName}: duplicate legacy rows need reconciliation.`);
    }
  }

  // Versioned migrations make startup repeatable while allowing real migration
  // failures to surface instead of being mistaken for an already-present column.
  const desiredSkillsMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  if (!desiredSkillsMigration) {
    const attemptColumns = db.prepare('PRAGMA table_info(assessment_attempts)').all();
    if (!attemptColumns.some((column) => column.name === 'desired_skills')) {
      db.exec('ALTER TABLE assessment_attempts ADD COLUMN desired_skills TEXT;');
    }
    db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
  }

  const researchProfileMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 2').get();
  if (!researchProfileMigration) {
    const profileColumns = db.prepare('PRAGMA table_info(respondent_profiles)').all();
    const profileColumnNames = new Set(profileColumns.map((column) => column.name));
    for (const [name, type] of [
      ['junior_high_school_type', 'TEXT'],
      ['senior_high_school_type', 'TEXT'],
      ['monthly_family_income_amount', 'INTEGER'],
    ]) {
      if (!profileColumnNames.has(name)) {
        db.exec(`ALTER TABLE respondent_profiles ADD COLUMN ${name} ${type};`);
      }
    }

    const assessmentColumns = db.prepare('PRAGMA table_info(assessments)').all();
    if (!assessmentColumns.some((column) => column.name === 'consent_required')) {
      db.exec('ALTER TABLE assessments ADD COLUMN consent_required INTEGER NOT NULL DEFAULT 1 CHECK (consent_required IN (0, 1));');
    }
    db.prepare('INSERT INTO schema_migrations (version) VALUES (2)').run();
  }

  const securityResearchMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 3').get();
  if (!securityResearchMigration) {
    const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
    for (const [name, definition] of [
      ['email_verified', 'INTEGER NOT NULL DEFAULT 1 CHECK (email_verified IN (0, 1))'],
      ['mfa_secret', 'TEXT'],
      ['mfa_enabled', 'INTEGER NOT NULL DEFAULT 0 CHECK (mfa_enabled IN (0, 1))'],
      ['is_demo', 'INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1))'],
    ]) {
      if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition};`);
    }

    const assessmentColumns = new Set(db.prepare('PRAGMA table_info(assessments)').all().map((column) => column.name));
    for (const [name, definition] of [
      ['instrument_snapshot', 'TEXT'],
      ['scoring_version', "TEXT NOT NULL DEFAULT 'dlas-mean-1.0'"],
    ]) {
      if (!assessmentColumns.has(name)) db.exec(`ALTER TABLE assessments ADD COLUMN ${name} ${definition};`);
    }

    const attemptColumns = new Set(db.prepare('PRAGMA table_info(assessment_attempts)').all().map((column) => column.name));
    for (const [name, definition] of [
      ['instrument_snapshot', 'TEXT'],
      ['scoring_version', "TEXT NOT NULL DEFAULT 'dlas-mean-1.0'"],
      ['desired_skills_redacted', 'TEXT'],
      ['desired_skills_reviewed_by', 'INTEGER REFERENCES users(id)'],
      ['desired_skills_reviewed_at', 'DATETIME'],
    ]) {
      if (!attemptColumns.has(name)) db.exec(`ALTER TABLE assessment_attempts ADD COLUMN ${name} ${definition};`);
    }

    const consentColumns = new Set(db.prepare('PRAGMA table_info(assessment_consents)').all().map((column) => column.name));
    for (const [name, definition] of [
      ['guardian_email', 'TEXT'],
      ['guardian_email_verified', 'INTEGER NOT NULL DEFAULT 0 CHECK (guardian_email_verified IN (0, 1))'],
    ]) {
      if (!consentColumns.has(name)) db.exec(`ALTER TABLE assessment_consents ADD COLUMN ${name} ${definition};`);
    }

    // Local databases that predate the explicit demo marker are detected by the known seeded account.
    if (db.prepare("SELECT 1 FROM users WHERE email = 'maria.santos@example.com'").get()) {
      db.prepare("UPDATE users SET is_demo = 1 WHERE email LIKE '%@example.com'").run();
      db.prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('demo_mode', '1') ON CONFLICT(setting_key) DO UPDATE SET setting_value = '1'").run();
    }
    const assessmentsMissingSnapshots = db.prepare('SELECT id FROM assessments WHERE instrument_snapshot IS NULL').all();
    for (const assessment of assessmentsMissingSnapshots) {
      const questionIds = db.prepare('SELECT question_id FROM assessment_questions WHERE assessment_id = ? ORDER BY id').all(assessment.id).map((row) => row.question_id);
      const snapshot = buildAssessmentSnapshot(questionIds);
      if (snapshot) db.prepare('UPDATE assessments SET instrument_snapshot = ?, scoring_version = ? WHERE id = ?').run(JSON.stringify(snapshot), snapshot.scoringVersion, assessment.id);
    }
    db.prepare(`
      UPDATE assessment_attempts
      SET instrument_snapshot = (SELECT instrument_snapshot FROM assessments WHERE assessments.id = assessment_attempts.assessment_id),
          scoring_version = (SELECT scoring_version FROM assessments WHERE assessments.id = assessment_attempts.assessment_id)
      WHERE instrument_snapshot IS NULL
    `).run();
    db.prepare("INSERT INTO system_settings (setting_key, setting_value) VALUES ('demo_mode', '0') ON CONFLICT(setting_key) DO NOTHING").run();
    db.prepare('INSERT INTO schema_migrations (version) VALUES (3)').run();
  }

  const consentEvidenceMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 4').get();
  if (!consentEvidenceMigration) {
    const consentColumns = new Set(db.prepare('PRAGMA table_info(assessment_consents)').all().map((column) => column.name));
    for (const [name, definition] of [
      ['participant_age', 'INTEGER'],
      ['consent_text_snapshot', 'TEXT'],
      ['assent_text_snapshot', 'TEXT'],
      ['guardian_consent_text_snapshot', 'TEXT'],
    ]) {
      if (!consentColumns.has(name)) db.exec(`ALTER TABLE assessment_consents ADD COLUMN ${name} ${definition};`);
    }
    const profileColumns = new Set(db.prepare('PRAGMA table_info(respondent_profiles)').all().map((column) => column.name));
    if (!profileColumns.has('profile_consent_version')) {
      db.exec('ALTER TABLE respondent_profiles ADD COLUMN profile_consent_version TEXT;');
    }
    db.prepare('INSERT INTO schema_migrations (version) VALUES (4)').run();
  }

  const improvementFeaturesMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 5').get();
  if (!improvementFeaturesMigration) {
    const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
    if (!userColumns.has('institutional_id')) db.exec('ALTER TABLE users ADD COLUMN institutional_id TEXT;');
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_institutional_id
        ON users (institutional_id) WHERE institutional_id IS NOT NULL AND institutional_id <> '';
      CREATE TABLE IF NOT EXISTS learning_modules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        competence_area_id INTEGER NOT NULL REFERENCES competence_areas(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        resource_url TEXT NOT NULL,
        estimated_minutes INTEGER NOT NULL DEFAULT 15,
        is_published INTEGER NOT NULL DEFAULT 0 CHECK (is_published IN (0, 1)),
        created_by INTEGER REFERENCES users(id),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS learning_module_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        module_id INTEGER NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        completed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (module_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_learning_modules_area ON learning_modules(competence_area_id, is_published);
      CREATE INDEX IF NOT EXISTS idx_learning_completions_user ON learning_module_completions(user_id, completed_at);
    `);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (5)').run();
  }

  const retakeRulesMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 6').get();
  if (!retakeRulesMigration) {
    const assessmentColumns = new Set(db.prepare('PRAGMA table_info(assessments)').all().map((column) => column.name));
    if (!assessmentColumns.has('max_attempts')) db.exec('ALTER TABLE assessments ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts BETWEEN 1 AND 10);');
    db.exec(`DROP INDEX IF EXISTS uq_assessment_attempts_pair;
      CREATE INDEX IF NOT EXISTS idx_attempts_assessment_user_started ON assessment_attempts(assessment_id, user_id, started_at DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_attempts_one_open
        ON assessment_attempts(assessment_id, user_id) WHERE status = 'in_progress';`);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (6)').run();
  }

  const learningApprovalMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 7').get();
  if (!learningApprovalMigration) {
    const moduleColumns = new Set(db.prepare('PRAGMA table_info(learning_modules)').all().map((column) => column.name));
    if (!moduleColumns.has('published_by')) db.exec('ALTER TABLE learning_modules ADD COLUMN published_by INTEGER REFERENCES users(id);');
    if (!moduleColumns.has('published_at')) db.exec('ALTER TABLE learning_modules ADD COLUMN published_at DATETIME;');
    db.exec(`UPDATE learning_modules SET published_by = COALESCE(published_by, created_by), published_at = COALESCE(published_at, updated_at, created_at) WHERE is_published = 1;`);
    db.prepare('INSERT INTO schema_migrations (version) VALUES (7)').run();
  }

  const digCompSatMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 8').get();
  if (!digCompSatMigration) {
    const questionColumns = new Set(db.prepare('PRAGMA table_info(questions)').all().map((column) => column.name));
    for (const [name, definition] of [
      ['instrument_code', "TEXT NOT NULL DEFAULT 'dlas-thesis-v1'"],
      ['response_type', 'TEXT'],
      ['proficiency_level', 'TEXT'],
      ['framework_competence_id', 'TEXT'],
    ]) {
      if (!questionColumns.has(name)) db.exec(`ALTER TABLE questions ADD COLUMN ${name} ${definition};`);
    }
    db.exec(`
      DROP INDEX IF EXISTS uq_questions_area_number;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_instrument_area_number
        ON questions(instrument_code, competence_area_id, question_number);
      CREATE INDEX IF NOT EXISTS idx_questions_instrument_active ON questions(instrument_code, is_active);
    `);
    const responseTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'responses'").get()?.sql || '';
    if (!/rating\s*>=\s*0/i.test(responseTableSql)) {
      db.exec(`
        DROP INDEX IF EXISTS idx_responses_attempt;
        DROP INDEX IF EXISTS uq_responses_attempt_question;
        ALTER TABLE responses RENAME TO responses_before_scale_update;
        CREATE TABLE responses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attempt_id INTEGER REFERENCES assessment_attempts(id),
          question_id INTEGER REFERENCES questions(id),
          rating INTEGER CHECK(rating >= 0 AND rating <= 4),
          answered_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO responses (id, attempt_id, question_id, rating, answered_at)
          SELECT id, attempt_id, question_id, rating, answered_at FROM responses_before_scale_update;
        DROP TABLE responses_before_scale_update;
        CREATE INDEX IF NOT EXISTS idx_responses_attempt ON responses(attempt_id);
        CREATE UNIQUE INDEX IF NOT EXISTS uq_responses_attempt_question ON responses(attempt_id, question_id);
      `);
    }
    db.prepare('INSERT INTO schema_migrations (version) VALUES (8)').run();
  }
  // The legacy natural key does not include the instrument and must not be
  // recreated by the compatibility index pass above on later startups.
  db.exec('DROP INDEX IF EXISTS uq_questions_area_number');

  const frameworkCompetenceMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 9').get();
  if (!frameworkCompetenceMigration) {
    const questionColumns = new Set(db.prepare('PRAGMA table_info(questions)').all().map((column) => column.name));
    if (!questionColumns.has('framework_competence_id')) db.exec('ALTER TABLE questions ADD COLUMN framework_competence_id TEXT;');
    db.prepare('INSERT INTO schema_migrations (version) VALUES (9)').run();
  }

  const integrityConfirmationMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 10').get();
  if (!integrityConfirmationMigration) {
    const attemptColumns = new Set(db.prepare('PRAGMA table_info(assessment_attempts)').all().map((column) => column.name));
    if (!attemptColumns.has('integrity_confirmed_at')) db.exec('ALTER TABLE assessment_attempts ADD COLUMN integrity_confirmed_at DATETIME;');
    if (!attemptColumns.has('integrity_statement_version')) db.exec('ALTER TABLE assessment_attempts ADD COLUMN integrity_statement_version TEXT;');
    db.prepare('INSERT INTO schema_migrations (version) VALUES (10)').run();
  }

  const dashboardCharacterMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 11').get();
  if (!dashboardCharacterMigration) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS dashboard_characters (
          user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          settings_json TEXT NOT NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (11)').run();
    })();
  }
  const emailOtpAndBackupCodesMigration = db.prepare('SELECT version FROM schema_migrations WHERE version = 14').get();
  if (!emailOtpAndBackupCodesMigration) {
    db.transaction(() => {
      const challengeColumns = new Set(db.prepare('PRAGMA table_info(mfa_challenges)').all().map((column) => column.name));
      if (!challengeColumns.has('otp_hash')) db.exec('ALTER TABLE mfa_challenges ADD COLUMN otp_hash TEXT;');

      const sessionColumns = new Set(db.prepare('PRAGMA table_info(auth_sessions)').all().map((column) => column.name));
      if (!sessionColumns.has('mfa_verified')) {
        db.exec('ALTER TABLE auth_sessions ADD COLUMN mfa_verified INTEGER NOT NULL DEFAULT 0 CHECK (mfa_verified IN (0, 1));');
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS mfa_backup_codes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL,
          used_at DATETIME,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_mfa_backup_codes_user ON mfa_backup_codes(user_id, used_at);
      `);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (14)').run();
    })();
  }
  require('./knowledge').initializeKnowledge(db);
  require('./bookmarks').initializeBookmarks(db);
}

function logActivity(userId, action, details = null) {
  try {
    const stmt = db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)');
    stmt.run(userId, action, details);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

module.exports = {
  db,
  dbPath,
  databaseConfig,
  initializeDatabase,
  logActivity,
  buildAssessmentSnapshot,
  SCORING_VERSION,
  DIGCOMPSAT_SCORING_VERSION,
  DLAS_INSTRUMENT_CODE,
  DIGCOMPSAT_INSTRUMENT_CODE,
};
