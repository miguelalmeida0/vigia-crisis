import { haversineKm } from '../geo.mjs';
import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

const ids = (record) => uniqueSorted(Object.values(record.identifiers ?? {}).flat().filter(Boolean));
export function explainIncidentAssociation(left, right, { maximumHours = 72, maximumDistanceKm = 30 } = {}) {
  const matchedIdentifiers = ids(left).filter((id) => ids(right).includes(id)), hours = Math.abs(Date.parse(left.discoveryTime) - Date.parse(right.discoveryTime)) / 3_600_000, distanceKm = Array.isArray(left.coordinate) && Array.isArray(right.coordinate) ? haversineKm(left.coordinate, right.coordinate) : null, temporalOverlap = Number.isFinite(hours) && hours <= maximumHours, spatialOverlap = Number.isFinite(distanceKm) && distanceKm <= maximumDistanceKm, conflicts = [];
  if (Number.isFinite(hours) && !temporalOverlap) conflicts.push('DISCOVERY_TIME_CONFLICT'); if (Number.isFinite(distanceKm) && !spatialOverlap) conflicts.push('SPATIAL_CONFLICT');
  const decision = matchedIdentifiers.length && !conflicts.length ? 'MATCH_EXPLICIT_IDENTIFIER' : temporalOverlap && spatialOverlap && !matchedIdentifiers.length ? 'AMBIGUOUS_SPATIOTEMPORAL_CANDIDATE' : 'NO_MATCH';
  const core = { schemaVersion: 'vigia.incident-association-explanation.v2', leftRecordId: left.recordId, rightRecordId: right.recordId, matchedIdentifiers, spatialOverlap, distanceKm, temporalOverlap, hours, sourceRelationship: `${left.providerId}->${right.providerId}`, conflicts, candidateAlternatives: [], decision };
  return immutable({ ...core, fingerprint: semanticHash('incident-association-explanation', core) });
}

export function buildIncidentCrosswalkV2(records = []) {
  const explanations = []; for (let left = 0; left < records.length; left += 1) for (let right = left + 1; right < records.length; right += 1) if (records[left].providerId !== records[right].providerId) explanations.push(explainIncidentAssociation(records[left], records[right]));
  const core = { schemaVersion: 'vigia.incident-crosswalk.v2', records: records.map((item) => item.recordId).sort(), explanations: explanations.sort((a, b) => a.fingerprint.localeCompare(b.fingerprint)), accepted: explanations.filter((item) => item.decision === 'MATCH_EXPLICIT_IDENTIFIER'), ambiguous: explanations.filter((item) => item.decision === 'AMBIGUOUS_SPATIOTEMPORAL_CANDIDATE') };
  return immutable({ ...core, fingerprint: semanticHash('incident-crosswalk-v2', core) });
}
