const QUIZ_TIMER_LEASE_MS = 15_000;

function parseCutoff(timestamp) {
  return timestamp ? Date.parse(timestamp) : Infinity;
}

function getAttemptTimer(attempt, now = Date.now()) {
  if (!attempt.timer_lease_until) return null;
  const deadline = parseCutoff(attempt.deadline);
  const leaseUntil = parseCutoff(attempt.timer_lease_until);
  const closesAt = parseCutoff(attempt.quiz_end_date);
  const elapsedThrough = attempt.status === 'completed' && attempt.completed_at ? Date.parse(attempt.completed_at) : now;
  const expired = attempt.status === 'completed'
    ? attempt.completion_reason === 'time_expired'
    : closesAt <= now || deadline <= Math.min(now, leaseUntil);
  const remainingMs = expired ? 0 : Math.max(0, Math.min(deadline - Math.min(elapsedThrough, leaseUntil), closesAt - elapsedThrough));

  return {
    remaining_ms: remainingMs,
    lease_until: attempt.timer_lease_until,
    closes_at: attempt.quiz_end_date || null,
    expired,
  };
}

function attemptHasExpired(attempt, now = Date.now()) {
  return getAttemptTimer(attempt, now)?.expired ?? (parseCutoff(attempt.deadline) <= now);
}

function attemptIsPaused(attempt, now = Date.now()) {
  return Boolean(attempt.timer_lease_until && Date.parse(attempt.timer_lease_until) <= now && !attemptHasExpired(attempt, now));
}

function renewAttemptTimer(db, attempt, now) {
  if (attempt.status !== 'in_progress' || !attempt.timer_lease_until) return attempt;
  const timer = getAttemptTimer(attempt, now);
  if (timer.expired) return attempt;
  const deadline = new Date(now + timer.remaining_ms).toISOString();
  const leaseUntil = new Date(Math.max(Date.parse(attempt.timer_lease_until), now + QUIZ_TIMER_LEASE_MS)).toISOString();
  db.prepare('UPDATE quiz_attempts SET deadline=?, timer_lease_until=? WHERE id=? AND status=?')
    .run(deadline, leaseUntil, attempt.id, 'in_progress');
  return { ...attempt, deadline, timer_lease_until: leaseUntil };
}

// Both aliases are static call-site identifiers. NULL values retain the previous deadline behavior.
function attemptExpiredSQL(attemptAlias, quizAlias) {
  return `((${attemptAlias}.timer_lease_until IS NOT NULL AND ${quizAlias}.end_date IS NOT NULL AND julianday(${quizAlias}.end_date)<=julianday('now'))
    OR (${attemptAlias}.deadline IS NOT NULL AND julianday(${attemptAlias}.deadline)<=
      MIN(julianday('now'),COALESCE(julianday(${attemptAlias}.timer_lease_until),julianday('now')))))`;
}

module.exports = { QUIZ_TIMER_LEASE_MS, getAttemptTimer, attemptHasExpired, attemptIsPaused, renewAttemptTimer, attemptExpiredSQL };
