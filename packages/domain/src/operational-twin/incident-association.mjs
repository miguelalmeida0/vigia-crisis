import { haversineKm } from '../geo.mjs';
import { canonicalIncidentId } from '../authorization.mjs';
import { semanticHash } from '../intelligence/shared.mjs';

function eventTime(event) { return Date.parse(event.clocks.observedAt ?? event.clocks.occurredAt); }
function exactIncidentKeys(event) { return (event.correlationKeys ?? []).filter((key) => key.startsWith('incident:')); }
function candidate(incident, event) {
  if (incident.hazardType !== event.hazardType || incident.location?.type !== 'Point' || event.geometry?.type !== 'Point') return null;
  const distanceKm = haversineKm(incident.location.coordinates, event.geometry.coordinates);
  const gapHours = Math.abs(eventTime(event) - incident.lastEventTimeMs) / 3_600_000;
  if (!Number.isFinite(distanceKm) || !Number.isFinite(gapHours) || distanceKm > 5 || gapHours > 12) return null;
  return { incident, distanceKm, gapHours, score: 1 - distanceKm / 10 - gapHours / 48 };
}
function attach(state, incident, event, method, details = {}) {
  if (!incident.eventIds.includes(event.id)) incident.eventIds.push(event.id);
  incident.lastEventTimeMs = Math.max(incident.lastEventTimeMs, eventTime(event));
  state.eventAssociations.set(event.id, { state: 'ASSOCIATED', incidentId: incident.id, method, ...details });
  for (const key of exactIncidentKeys(event)) state.keyToIncident.set(key, incident.id);
  return incident;
}
function createIncident(state, event, explicitId = null) {
  const id = explicitId ?? semanticHash('incident', { hazardType: event.hazardType, seedEventId: event.id });
  const incident = { id, hazardType: event.hazardType, openedAt: event.clocks.occurredAt ?? event.clocks.observedAt, location: event.geometry, seedEventId: event.id, eventIds: [], lastEventTimeMs: eventTime(event) };
  state.incidents.set(id, incident); return attach(state, incident, event, explicitId ? 'EXACT_CORRELATION_KEY' : 'NEW_INCIDENT');
}

export function createAssociationState() { return { incidents: new Map(), keyToIncident: new Map(), eventAssociations: new Map(), ambiguities: [] }; }

export function associateOperationalEvent(state, event, targetEvent = null) {
  if (targetEvent) {
    const inherited = state.eventAssociations.get(targetEvent.id);
    if (inherited?.state === 'ASSOCIATED') return attach(state, state.incidents.get(inherited.incidentId), event, 'AMENDMENT_LINEAGE', { targetEventId: targetEvent.id });
    if (inherited?.state === 'AMBIGUOUS') {
      const result = { ...inherited, eventId: event.id, method: 'AMBIGUOUS_AMENDMENT_LINEAGE', targetEventId: targetEvent.id };
      state.eventAssociations.set(event.id, result); state.ambiguities.push(result); return null;
    }
  }
  const keys = [...new Set(exactIncidentKeys(event))];
  // The compatibility adapter declares a primary ID plus source aliases. Those
  // are context associations, not multiple independent incident assertions.
  const compatibilityPrimary = `incident:${canonicalIncidentId(event.provider?.providerEventId)}`;
  const declaredAliases = new Set([compatibilityPrimary, ...(event.payload?.sourceIncidentIds ?? []).map(id => `incident:${canonicalIncidentId(id)}`)]);
  const compatibility = event.eventType === 'wildfire.compatibility_incident_projection'
    && event.source?.familyClass === 'SYSTEM' && event.payload?.compatibilityProjection === true
    && event.provenance?.proofStatus === 'COMPATIBILITY_BOUNDARY'
    && keys.includes(compatibilityPrimary) && keys.every(key => declaredAliases.has(key));
  const targets = [...new Set(keys.map(key => state.keyToIncident.get(key) ?? (compatibility ? compatibilityPrimary : key)))];
  if (targets.length > 1) return ambiguous(state, event, targets, 'CONFLICTING_CORRELATION_KEYS');
  const exact = [...new Set(keys.map((key) => state.keyToIncident.get(key) ?? (state.incidents.has(key) ? key : null)).filter(Boolean))];
  if (exact.length === 1) return attach(state, state.incidents.get(exact[0]), event, 'EXACT_CORRELATION_KEY');
  if (exact.length > 1) return ambiguous(state, event, exact, 'CONFLICTING_CORRELATION_KEYS');
  const explicit = compatibility ? compatibilityPrimary : exactIncidentKeys(event)[0];
  if (explicit && !state.incidents.has(explicit)) return createIncident(state, event, explicit);
  const ranked = [...state.incidents.values()].map((incident) => candidate(incident, event)).filter(Boolean)
    .sort((left, right) => right.score - left.score || left.incident.id.localeCompare(right.incident.id));
  if (!ranked.length) return createIncident(state, event);
  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.08) return ambiguous(state, event, ranked.slice(0, 2).map((item) => item.incident.id), 'INSUFFICIENT_SEPARATION_MARGIN', ranked);
  return attach(state, ranked[0].incident, event, 'SPATIOTEMPORAL_HYPOTHESIS', { score: Number(ranked[0].score.toFixed(3)), calibrated: false });
}

function ambiguous(state, event, incidentIds, reason, candidates = []) {
  const result = { state: 'AMBIGUOUS', eventId: event.id, incidentIds: [...incidentIds].sort(), reason, candidates: candidates.map((item) => ({ incidentId: item.incident.id, score: Number(item.score.toFixed(3)), distanceKm: Number(item.distanceKm.toFixed(3)), gapHours: Number(item.gapHours.toFixed(3)) })) };
  state.eventAssociations.set(event.id, result); state.ambiguities.push(result); return null;
}
