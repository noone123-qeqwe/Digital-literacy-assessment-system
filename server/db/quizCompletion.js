// Match JavaScript String.trim(), including tabs, line breaks and Unicode spaces.
const nonblankAnswerSQL = "trim(r.answer,char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279))<>''";

function initializeQuizCompletion(db) {
  const columns = db.prepare('PRAGMA table_info(quiz_attempts)').all();
  db.transaction(() => {
    if (!columns.some(column => column.name === 'completion_reason')) {
      db.exec("ALTER TABLE quiz_attempts ADD COLUMN completion_reason TEXT CHECK(completion_reason IS NULL OR completion_reason IN ('submitted','time_expired'));");
    }
    // Earlier clients finalized expired attempts as completed, even with no
    // answers. Retain their scores and identify how those attempts ended.
    db.exec(`UPDATE quiz_attempts SET completion_reason=CASE
      WHEN (deadline IS NOT NULL AND julianday(completed_at)>=julianday(deadline))
        OR (SELECT COUNT(*) FROM quiz_responses r WHERE r.attempt_id=quiz_attempts.id AND ${nonblankAnswerSQL})<json_array_length(snapshot_json,'$.questions')
      THEN 'time_expired' ELSE 'submitted' END
      WHERE status='completed' AND completion_reason IS NULL;`);
  })();
}

module.exports = { initializeQuizCompletion, nonblankAnswerSQL };
