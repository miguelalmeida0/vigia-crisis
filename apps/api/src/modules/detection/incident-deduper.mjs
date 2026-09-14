import { haversineKm } from '../../../../../packages/domain/src/geo.mjs';
import { safeTimestamp } from '../../../../../packages/domain/src/timestamp-firewall.mjs';

function normalized(value = '') { return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function time(value) { const safe = safeTimestamp(value); return safe ? Date.parse(safe) : null; }
function sameIncident(a, b) {
  const distance = haversineKm(a.coordinate, b.coordinate); if (!Number.isFinite(distance) || distance > 4.5) return false;
  const codeMatch = a.municipalityCode && b.municipalityCode && String(a.municipalityCode) === String(b.municipalityCode);
  const nameMatch = normalized(a.municipality) && normalized(a.municipality) === normalized(b.municipality);
  if (!codeMatch && !nameMatch) return false;
  const ta = time(a.startedAt); const tb = time(b.startedAt); return ta === null || tb === null || Math.abs(ta - tb) <= 12 * 60 * 60_000;
}
function merge(group) {
  const ordered = [...group].sort((a, b) => (time(b.updatedAt) ?? 0) - (time(a.updatedAt) ?? 0)); const primary = ordered[0];
  return { ...primary, operatives: Math.max(...group.map((item) => Number(item.operatives) || 0)), ground: Math.max(...group.map((item) => Number(item.ground) || 0)), aerial: Math.max(...group.map((item) => Number(item.aerial) || 0)), important: group.some((item) => item.important), sourceRecordCount: group.length, sourceRecordIds: group.map((item) => String(item.id)), duplicateGroup: group.length > 1 };
}
export function dedupeOccurrences(occurrences = []) {
  const groups = []; for (const occurrence of occurrences) { const group = groups.find((candidate) => sameIncident(candidate[0], occurrence)); if (group) group.push(occurrence); else groups.push([occurrence]); }
  return groups.map(merge);
}
