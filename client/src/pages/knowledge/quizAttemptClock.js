export const quizClockIntervalMs = 6_000;
export const quizClockTimeoutMs = 4_000;

export function quizAttemptClock(data, now, pausedAt = now) {
  if (!data?.timer) {
    const deadline = data?.attempt.deadline ? Date.parse(data.attempt.deadline) : Infinity;
    return {
      managed: false,
      remainingMs: Number.isFinite(deadline) ? Math.max(0, deadline - now) : null,
      expired: deadline <= now,
      active: true,
    };
  }

  const { timer } = data;
  const leaseEnd = Date.parse(timer.lease_until);
  const checkpoint = Date.parse(data.server_now);
  const elapsed = Math.max(0, Math.min(pausedAt, leaseEnd) - checkpoint);
  const closingTime = timer.closes_at ? Date.parse(timer.closes_at) : Infinity;
  const remainingMs = Math.max(0, Math.min(timer.remaining_ms - elapsed, closingTime - now));
  // A zero in the preview locks editing. Only the server can confirm expiry.
  const expired = timer.expired;
  return { managed: true, remainingMs, expired, active: !expired && leaseEnd > now && remainingMs > 0 };
}
