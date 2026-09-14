import { haversineKm } from '../geo.mjs';
import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

function identifiers(record) { return uniqueSorted(Object.values(record.identifiers ?? {}).flat().filter(Boolean)); }
function overlap(left, right) { const rightIds = new Set(identifiers(right)); return identifiers(left).some((id) => rightIds.has(id)); }
function compatible(left, right) {
  const hours = Math.abs(Date.parse(left.discoveryTime) - Date.parse(right.discoveryTime)) / 3_600_000;
  const distanceKm = Array.isArray(left.coordinate) && Array.isArray(right.coordinate) ? haversineKm(left.coordinate, right.coordinate) : Infinity;
  return { hours, distanceKm, score: (hours <= 72 ? 2 : 0) + (distanceKm <= 10 ? 2 : distanceKm <= 30 ? 1 : 0) };
}
export function buildIncidentCrosswalk(records = []) {
  const sorted = [...records].sort((a, b) => String(a.recordId).localeCompare(String(b.recordId))), groups = [], ambiguous = [];
  for (const record of sorted) {
    const exact = groups.filter((group) => group.records.some((candidate) => overlap(record, candidate)));
    if (exact.length === 1) { exact[0].records.push(record); continue; }
    if (exact.length > 1) { ambiguous.push({ recordId: record.recordId, reason: 'IDENTIFIER_CONNECTS_MULTIPLE_INCIDENTS', candidateGroups: exact.map((group) => group.seed) }); continue; }
    const candidates = groups.map((group) => ({ group, ...compatible(record, group.records[0]) })).filter((item) => item.score >= 4).sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm);
    if (candidates.length === 1 || candidates[0]?.score > candidates[1]?.score) candidates[0].group.records.push(record);
    else if (candidates.length) ambiguous.push({ recordId: record.recordId, reason: 'SPATIOTEMPORAL_ASSOCIATION_AMBIGUOUS', candidateGroups: candidates.map((item) => item.group.seed) });
    else groups.push({ seed: record.recordId, records: [record] });
  }
  const incidents = groups.map((group) => { const recordIds = group.records.map((item) => item.recordId).sort(), core = { recordIds, identifiers: uniqueSorted(group.records.flatMap(identifiers)), providers: uniqueSorted(group.records.map((item) => item.providerId)) }; return { ...core, incidentId: semanticHash('corpus-incident', core) }; }).sort((a, b) => a.incidentId.localeCompare(b.incidentId));
  const core = { schemaVersion: 'vigia.incident-crosswalk.v1', incidents, ambiguous: ambiguous.sort((a, b) => a.recordId.localeCompare(b.recordId)) };
  return immutable({ ...core, fingerprint: semanticHash('incident-crosswalk', core) });
}
