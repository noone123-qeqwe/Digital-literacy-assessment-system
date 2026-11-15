function enrollPublishedQuizzes(db, userId = null, quizId = null) {
  const conditions = ["q.status='published'", 'q.auto_assign_verified=1', "u.role='respondent'", "u.status='active'", 'u.email_verified=1'];
  const parameters = [];
  if (userId !== null) { conditions.push('u.id=?'); parameters.push(userId); }
  if (quizId !== null) { conditions.push('q.id=?'); parameters.push(quizId); }
  return db.prepare(`INSERT INTO quiz_assignments(quiz_id,user_id,assigned_by)
    SELECT q.id,u.id,q.created_by FROM knowledge_quizzes q CROSS JOIN users u
    WHERE ${conditions.join(' AND ')} ON CONFLICT(quiz_id,user_id) DO NOTHING`).run(...parameters);
}

module.exports = { enrollPublishedQuizzes };
