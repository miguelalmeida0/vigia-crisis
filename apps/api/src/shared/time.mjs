import { inspectTimestamp } from '../../../../packages/domain/src/timestamp-firewall.mjs';

export function isoDateDaysAgo(days, clock = () => new Date()) {
  const date = new Date(clock()); date.setUTCDate(date.getUTCDate() - Number(days)); return date.toISOString().slice(0, 10);
}
export function ageMinutes(value, now = new Date()) {
  const inspected = inspectTimestamp(value, { now: new Date(now) });
  return inspected.valid ? Math.round(inspected.ageSeconds / 60) : null;
}
export function newestIso(values) {
  const valid = values.map((value) => Date.parse(value)).filter(Number.isFinite); return valid.length ? new Date(Math.max(...valid)).toISOString() : null;
}
