const { STARTER_MATERIALS } = require('./starterMaterials');

const categories = [
  ['Computer Literacy', 'Understand devices, operating systems, files, and troubleshooting.', 'Name hardware and software and explain their roles.|Organize files into clearly named folders and keep a backup.|Install updates from trusted sources and restart when required.|Use keyboard shortcuts, accessibility tools, and safe troubleshooting.'],
  ['Internet Literacy', 'Navigate websites, browsers, searches, and online services.', 'Check the address of the website before entering information.|Use browser tabs, bookmarks, and specific search terms.|Distinguish a search result from a paid advertisement.|Download files only from trusted publishers.'],
  ['Information Literacy', 'Find, evaluate, organize, and acknowledge information.', 'Identify the author, publication date, and evidence behind a claim.|Compare independent reliable sources before sharing a claim.|Separate opinion, advertising, and evidence.|Credit the original author and respect the source license.'],
  ['Digital Communication', 'Communicate clearly and respectfully using digital tools.', 'Choose an appropriate channel and write a clear subject line.|Check recipients and attachments before sending a message.|Use respectful language and make shared documents accessible.|Avoid publishing another person’s private information.'],
  ['Digital Safety and Security', 'Protect accounts, devices, and personal information.', 'Use long unique passwords and a password manager.|Enable multi-factor authentication where available.|Verify unexpected requests through a separate trusted channel.|Keep backups and report suspicious messages to authorized staff.'],
  ['Digital Citizenship', 'Participate ethically and responsibly in online communities.', 'Respect copyright, consent, and community rules.|Consider how a post affects your digital footprint.|Report harassment using the platform’s reporting tools.|Use accessible formats and respect other people’s perspectives.'],
  ['Productivity Tools', 'Use documents, spreadsheets, presentations, and collaboration tools.', 'Use headings and meaningful file names to organize documents.|Start spreadsheet formulas with an equals sign and verify cell ranges.|Use readable presentation text and meaningful alternative text.|Control sharing permissions and track document versions.'],
  ['Media Literacy', 'Interpret media, recognize manipulation, and create responsibly.', 'Ask who created a message, for whom, and for what purpose.|Check the original context of images and short video clips.|Recognize sponsored content and emotionally manipulative headlines.|Label your own sources and verify claims before reposting.'],
];

function initializeKnowledge(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES quiz_categories(id),
      prompt TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('multiple_choice','true_false','identification')),
      options_json TEXT NOT NULL DEFAULT '[]', answers_json TEXT NOT NULL,
      points INTEGER NOT NULL CHECK(points BETWEEN 1 AND 100), explanation TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1, created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS knowledge_quizzes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      instructions TEXT NOT NULL DEFAULT '', created_by INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
      time_limit_minutes INTEGER, max_attempts INTEGER NOT NULL DEFAULT 1,
      pass_percentage REAL NOT NULL DEFAULT 70, randomize INTEGER NOT NULL DEFAULT 1,
      start_date TEXT, end_date TEXT, snapshot_json TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS quiz_assignments (
      quiz_id INTEGER NOT NULL REFERENCES knowledge_quizzes(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by INTEGER REFERENCES users(id), PRIMARY KEY(quiz_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL REFERENCES knowledge_quizzes(id),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed')),
      snapshot_json TEXT NOT NULL, deadline TEXT, started_at TEXT NOT NULL,
      completed_at TEXT, earned_points REAL, possible_points REAL, percentage REAL,
      level TEXT, certificate_earned INTEGER NOT NULL DEFAULT 0, integrity_confirmed_at TEXT NOT NULL,
      answers_revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_in_progress ON quiz_attempts(quiz_id,user_id) WHERE status='in_progress';
    CREATE INDEX IF NOT EXISTS idx_quiz_attempt_user ON quiz_attempts(user_id,quiz_id,status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_quiz_creator ON knowledge_quizzes(created_by);
    CREATE TABLE IF NOT EXISTS quiz_category_results (
      attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL, category_name TEXT NOT NULL,
      earned REAL NOT NULL, possible REAL NOT NULL, percentage REAL NOT NULL,
      PRIMARY KEY(attempt_id,category_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_responses (
      attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      question_id INTEGER NOT NULL, answer TEXT NOT NULL, saved_at TEXT NOT NULL,
      PRIMARY KEY(attempt_id,question_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER NOT NULL REFERENCES quiz_categories(id),
      title TEXT NOT NULL, content TEXT NOT NULL, resource_url TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '', image_caption TEXT NOT NULL DEFAULT '',
      video_url TEXT NOT NULL DEFAULT '', video_title TEXT NOT NULL DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS quiz_material_completions (
      material_id INTEGER NOT NULL REFERENCES quiz_materials(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      completed_at TEXT NOT NULL, PRIMARY KEY(material_id,user_id)
    );
  `);
  if (!db.prepare('PRAGMA table_info(quiz_attempts)').all().some((column) => column.name === 'answers_revision')) db.exec('ALTER TABLE quiz_attempts ADD COLUMN answers_revision INTEGER NOT NULL DEFAULT 0');
  // Academic-integrity signals recorded during an attempt (tab switches, copy/paste, extra sign-in sessions).
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_integrity_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES quiz_attempts(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', occurred_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_integrity_attempt ON quiz_integrity_events(attempt_id, event_type);
  `);
  require('./quizCompletion').initializeQuizCompletion(db);
  if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=12').get()) {
    db.transaction(() => {
      for (const [name, description, tips] of categories) {
        const result = db.prepare('INSERT INTO quiz_categories(name,description) VALUES(?,?)').run(name, description);
        db.prepare('INSERT INTO quiz_materials(category_id,title,content) VALUES(?,?,?)')
          .run(result.lastInsertRowid, `${name}: essential skills`, `${description}\n\n${tips.split('|').map((tip, i) => `${i + 1}. ${tip}`).join('\n\n')}\n\nTry it: demonstrate one of these skills, explain your steps, and reflect on what you could improve.`);
      }
      db.prepare('INSERT INTO schema_migrations(version) VALUES(12)').run();
    })();
  }
  if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=13').get()) {
    db.transaction(() => {
      db.exec('ALTER TABLE quiz_questions ADD COLUMN content_key TEXT;');
      db.exec('CREATE UNIQUE INDEX uq_quiz_question_content_key ON quiz_questions(content_key) WHERE content_key IS NOT NULL;');
      db.exec('ALTER TABLE knowledge_quizzes ADD COLUMN curriculum_key TEXT;');
      db.exec('ALTER TABLE knowledge_quizzes ADD COLUMN program_code TEXT;');
      db.exec("ALTER TABLE knowledge_quizzes ADD COLUMN stage TEXT CHECK(stage IS NULL OR stage IN ('baseline','follow_up'));");
      db.exec('ALTER TABLE knowledge_quizzes ADD COLUMN prerequisite_quiz_id INTEGER REFERENCES knowledge_quizzes(id);');
      db.exec('ALTER TABLE knowledge_quizzes ADD COLUMN auto_assign_verified INTEGER NOT NULL DEFAULT 0 CHECK(auto_assign_verified IN (0,1));');
      db.exec('CREATE UNIQUE INDEX uq_quiz_curriculum_key ON knowledge_quizzes(curriculum_key) WHERE curriculum_key IS NOT NULL;');
      db.prepare('INSERT INTO schema_migrations(version) VALUES(13)').run();
    })();
  }
  const materialColumns = new Set(db.prepare('PRAGMA table_info(quiz_materials)').all().map((column) => column.name));
  if (!materialColumns.has('image_url')) db.exec("ALTER TABLE quiz_materials ADD COLUMN image_url TEXT NOT NULL DEFAULT '';");
  if (!materialColumns.has('image_caption')) db.exec("ALTER TABLE quiz_materials ADD COLUMN image_caption TEXT NOT NULL DEFAULT '';");
  if (!materialColumns.has('video_url')) db.exec("ALTER TABLE quiz_materials ADD COLUMN video_url TEXT NOT NULL DEFAULT '';");
  if (!materialColumns.has('video_title')) db.exec("ALTER TABLE quiz_materials ADD COLUMN video_title TEXT NOT NULL DEFAULT '';");
  if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=16').get()) {
    db.transaction(() => {
      const categoryIds = new Map(db.prepare('SELECT id, name FROM quiz_categories').all().map((row) => [row.name, row.id]));
      const updateStarter = db.prepare('UPDATE quiz_materials SET title=?,content=?,image_url=?,image_caption=?,video_url=?,video_title=? WHERE id=?');
      const insertStarter = db.prepare('INSERT INTO quiz_materials(category_id,title,content,image_url,image_caption,video_url,video_title) VALUES(?,?,?,?,?,?,?)');
      for (const starter of STARTER_MATERIALS) {
        const categoryId = categoryIds.get(starter.category);
        if (!categoryId) continue;
        const starterRow = db.prepare("SELECT id FROM quiz_materials WHERE category_id=? AND resource_url='' AND length(content) < 3500 AND (title=? OR title LIKE ?) ORDER BY id LIMIT 1")
          .get(categoryId, starter.legacyTitle, `${starter.category.replace(/&/g, '%')}%`);
        if (starterRow) {
          updateStarter.run(starter.title, starter.content, starter.image_url, starter.image_caption, starter.video_url, starter.video_title, starterRow.id);
        } else if (!db.prepare('SELECT 1 FROM quiz_materials WHERE category_id=?').get(categoryId)) {
          insertStarter.run(categoryId, starter.title, starter.content, starter.image_url, starter.image_caption, starter.video_url, starter.video_title);
        }
      }
      if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=15').get()) {
        db.prepare('INSERT INTO schema_migrations(version) VALUES(15)').run();
      }
      db.prepare('INSERT INTO schema_migrations(version) VALUES(16)').run();
    })();
  }
}

module.exports = { initializeKnowledge };
