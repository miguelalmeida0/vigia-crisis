export function parseInstant(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ageSeconds(value, now = new Date()) {
  const date = parseInstant(value);
  if (!date) return null;
  return Math.round((now.getTime() - date.getTime()) / 1000);
}

export function evaluateFreshness({
  upstreamAt,
  fetchedAt,
  staleAfterSeconds,
  now = new Date(),
  error = null
}) {
  const reference = parseInstant(upstreamAt) ?? parseInstant(fetchedAt);
  if (!reference) {
    return {
      state: error ? 'unavailable' : 'unknown',
      ageSeconds: null,
      timeConflict: false
    };
  }

  const age = Math.round((now.getTime() - reference.getTime()) / 1000);
  const timeConflict = age < -120;
  if (timeConflict) return { state: 'conflict', ageSeconds: age, timeConflict: true };
  if (error) return { state: 'stale', ageSeconds: age, timeConflict: false };
  if (Number.isFinite(staleAfterSeconds) && age > staleAfterSeconds) {
    return { state: 'stale', ageSeconds: age, timeConflict: false };
  }
  return { state: 'current', ageSeconds: age, timeConflict: false };
}
