import { immutable, isoTime } from '../../intelligence/shared.mjs';

export function evaluateKillSwitch(killSwitch, action, at) {
  const evaluatedAt = isoTime(at, 'kill_switch_evaluation_time_required');
  if (!killSwitch?.engaged) return immutable({ allowed: true, state: 'CLEAR', reasons: [] });
  const scopes = new Set(killSwitch.scopes ?? ['ALL']);
  const applies = scopes.has('ALL') || scopes.has(action.type) || scopes.has(action.safetyClass) || scopes.has(action.incidentId) || scopes.has(action.target?.sourceId);
  return immutable({ allowed: !applies, state: applies ? 'ENGAGED' : 'CLEAR', reasons: applies ? [`KILL_SWITCH:${killSwitch.reason ?? 'UNSPECIFIED'}`, `EVALUATED_AT:${evaluatedAt}`] : [] });
}
