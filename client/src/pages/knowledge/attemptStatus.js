export const timeExpiredResult = (attempt) => attempt?.completion_reason === 'time_expired';
export const resultStatusLabel = (attempt) => timeExpiredResult(attempt) ? 'Time expired' : attempt?.instrument === 'research' ? 'Completed' : 'Submitted';

export function knowledgeQuizState(quiz, now = Date.now()) {
  const ongoing = quiz.latest_status === 'in_progress';
  const deadline = quiz.latest_deadline ? Date.parse(quiz.latest_deadline) : NaN;
  const leaseUntil = quiz.latest_timer_lease_until ? Date.parse(quiz.latest_timer_lease_until) : NaN;
  const pausable = Number.isFinite(leaseUntil);
  const closed = Boolean(quiz.end_date && Date.parse(quiz.end_date) <= now);
  const ranOutOfTime = deadline <= now && (!pausable || deadline <= leaseUntil);
  const expired = quiz.latest_completion_reason === 'time_expired' || (ongoing && (closed || ranOutOfTime));
  const paused = ongoing && !expired && pausable && leaseUntil <= now;
  const exhausted = Number(quiz.attempt_count || 0) >= Number(quiz.max_attempts || 1);
  const future = Boolean(quiz.start_date && Date.parse(quiz.start_date) > now);
  const locked = Boolean(quiz.prerequisite_quiz_id && !quiz.prerequisite_completed && !ongoing);
  const status = expired ? 'time_expired' : paused ? 'paused' : ongoing ? 'in_progress' : quiz.latest_status === 'completed' ? 'submitted'
    : exhausted ? 'attempt_limit' : locked ? 'locked' : future ? 'scheduled' : closed ? 'closed' : 'available';
  const labels = { time_expired: 'Time expired', paused: 'Paused', in_progress: 'In progress', submitted: 'Submitted',
    attempt_limit: 'Attempt limit reached', locked: 'Complete baseline first', scheduled: 'Scheduled', closed: 'Closed', available: 'Available' };
  return { ongoing, expired, paused, pausable, exhausted, closed, future, locked, status, label: labels[status] };
}
