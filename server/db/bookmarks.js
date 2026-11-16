function initializeBookmarks(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_bookmarks (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quiz_id INTEGER NOT NULL REFERENCES knowledge_quizzes(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,quiz_id)
    );
    CREATE TABLE IF NOT EXISTS assessment_bookmarks (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_id,assessment_id)
    );
    CREATE INDEX IF NOT EXISTS idx_quiz_bookmark_quiz ON quiz_bookmarks(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_bookmark_assessment ON assessment_bookmarks(assessment_id);
  `);
}

module.exports = { initializeBookmarks };
