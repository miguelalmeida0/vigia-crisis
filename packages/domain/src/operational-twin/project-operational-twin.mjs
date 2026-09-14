import { immutable, isoTime, semanticHash } from '../intelligence/shared.mjs';
import { sourceHealthProjection } from '../event-fabric/source-registry.mjs';
import { createAssociationState, associateOperationalEvent } from './incident-association.mjs';
import { applyRelationEvent, createRelationState, relationProjection, visibleEvents } from './event-relations.mjs';
import { buildIncidentIntelligence } from './evidence-projection.mjs';
import { isControlPlaneEvent, projectControlPlaneEvents } from './control-plane-projection.mjs';
import { assessmentChanges, sourceChanges, timerChange } from './material-changes.mjs';

function currentHealth(registry, healthEvents, asOf) { return sourceHealthProjection(registry, healthEvents, asOf); }
function eventTime(event) { return event.clocks.ingestedAt; }
function incidentEvents(incident, relationState) { return incident.eventIds.map((id) => relationState.byId.get(id)).filter(Boolean); }
function activeIncidentEvents(incident, relationState) { return incidentEvents(incident, relationState).filter((event) => relationState.activeIds.has(event.id) && event.action !== 'CANCEL'); }
function materialEvaluationKey(evaluation) {
  return semanticHash('material-evidence-state', {
    state: evaluation.state, satisfied: evaluation.satisfied,
    qualifyingCausalKeys: evaluation.qualifyingEvidence.flatMap((item) => item.causalLineage.causalKeys).sort(),
    satisfiedRequirements: evaluation.satisfiedRequirements.map((item) => item.id).sort(),
    unmetRequirements: evaluation.unmetRequirements.map((item) => ({ id: item.id, count: item.actual?.count ?? null, sourceFamilyIds: item.actual?.sourceFamilyIds ?? [] })),
    contradictions: evaluation.contradictions.map((item) => ({ causalKeys: item.causalLineage.causalKeys, blocking: item.blocking, contradictionStatus: item.contradictionStatus }))
  });
}
function transitionRecord(intelligence, causedByEventIds, at, occurredAt = at) {
  const change = intelligence.evaluation.transitionExplanation;
  const core = {
    schemaVersion: 'vigia.operational-twin-transition.v1', incidentId: intelligence.incident.id, claimId: intelligence.claim.id,
    entityType: 'CLAIM', entityId: intelligence.claim.id, at, occurredAt, evaluatedAt: at,
    causedByEventIds: [...causedByEventIds].sort(), from: change.from, to: change.to, contractReference: intelligence.contract,
    addedQualifyingEvidence: change.addedQualifyingEvidence, removedQualifyingEvidence: change.removedQualifyingEvidence,
    newlySatisfiedRequirements: change.newlySatisfiedRequirements, newlyUnmetRequirements: change.newlyUnmetRequirements,
    addedContradictions: change.addedContradictions, removedContradictions: change.removedContradictions, reasons: change.reasons
  };
  return { ...core, transitionId: semanticHash('operational-transition', core) };
}
function sourceTransition(sourceId, from, to, at, causedByEventIds, reason, occurredAt = at) {
  const core = {
    schemaVersion: 'vigia.operational-twin-transition.v1', entityType: 'SOURCE', entityId: sourceId, sourceId,
    at, occurredAt, evaluatedAt: at, causedByEventIds: [...causedByEventIds].sort(), from, to, contractReference: null,
    addedQualifyingEvidence: [], removedQualifyingEvidence: [], newlySatisfiedRequirements: [], newlyUnmetRequirements: [], addedContradictions: [], removedContradictions: [], reasons: [reason]
  };
  return { ...core, transitionId: semanticHash('operational-transition', core) };
}

export function projectOperationalTwin({ events = [], sourceRegistry, asOf }) {
  const projectedAt = isoTime(asOf, 'twin_as_of_required'), visible = visibleEvents(events, projectedAt);
  const relations = createRelationState(), associations = createAssociationState(), healthEvents = [], intelligenceByIncident = new Map(), transitions = [], materialChanges = [];
  let healthClock = sourceRegistry.sources.map((source) => source.registeredAt).filter((at) => Date.parse(at) <= Date.parse(projectedAt)).sort()[0] ?? visible[0]?.clocks.ingestedAt ?? projectedAt;
  const advanceSourceHealth = (to) => {
    const before = currentHealth(sourceRegistry, healthEvents, healthClock), after = currentHealth(sourceRegistry, healthEvents, to);
    for (const source of after.sources) {
      const prior = before.sources.find((item) => item.sourceId === source.sourceId);
      if (prior && prior.status !== source.status) transitions.push(sourceTransition(source.sourceId, prior.status, source.status, to, [], 'Expected source cadence was exceeded at projection time.'));
    }
    healthClock = to;
  };
  const causedOccurredAt = (ids, fallback) => ids.map((id) => relations.byId.get(id) ?? healthEvents.find((event) => event.id === id))
    .map((event) => event?.clocks.occurredAt ?? event?.clocks.observedAt).filter(Boolean).sort()[0] ?? fallback;
  const recompute = (incidentIds, at, causedByEventIds) => {
    const health = currentHealth(sourceRegistry, healthEvents, at);
    for (const incidentId of [...new Set(incidentIds)].sort()) {
      const incident = associations.incidents.get(incidentId); if (!incident) continue;
      const priorIntelligence = intelligenceByIncident.get(incidentId), prior = priorIntelligence?.evaluation ?? null;
      const intelligence = buildIncidentIntelligence({ incident, activeEvents: activeIncidentEvents(incident, relations), historicalEvents: incidentEvents(incident, relations), sourceHealth: health, asOf: at, previousEvaluation: prior });
      const changes = assessmentChanges(priorIntelligence, intelligence, at);
      const timerBasis = { eventIds: intelligence.eventIds, health: health.sources.map(source => [source.sourceId,source.status,source.lastHealthEventId]) };
      materialChanges.push(...changes.map(change => causedByEventIds.length ? change : timerChange(change,timerBasis)));
      intelligenceByIncident.set(incidentId, intelligence);
      const material = !prior || materialEvaluationKey(prior) !== materialEvaluationKey(intelligence.evaluation);
      if (material) transitions.push(transitionRecord(intelligence, causedByEventIds, at, causedOccurredAt(causedByEventIds, at)));
    }
  };
  for (const event of visible) {
    advanceSourceHealth(eventTime(event));
    if (isControlPlaneEvent(event)) continue;
    if (event.eventType === 'source.health_changed') {
      const before = currentHealth(sourceRegistry, healthEvents, eventTime(event)).sources.find((item) => item.sourceId === event.payload.targetSourceId);
      healthEvents.push(event);
      const after = currentHealth(sourceRegistry, healthEvents, eventTime(event)).sources.find((item) => item.sourceId === event.payload.targetSourceId);
      if (before && after && before.status !== after.status) transitions.push(sourceTransition(after.sourceId, before.status, after.status, eventTime(event), [event.id], after.reason, event.clocks.occurredAt ?? event.clocks.observedAt));
      recompute([...associations.incidents.keys()], eventTime(event), [event.id]); continue;
    }
    const affected = [], applied = [];
    applyRelationEvent(relations, event, (appliedEvent, target) => {
      const incident = associateOperationalEvent(associations, appliedEvent, target); applied.push(appliedEvent.id);
      if (incident) affected.push(incident.id);
      const targetAssociation = target ? associations.eventAssociations.get(target.id) : null;
      if (targetAssociation?.incidentId) affected.push(targetAssociation.incidentId);
    });
    recompute(affected, eventTime(event), applied.length ? applied : [event.id]);
  }
  advanceSourceHealth(projectedAt);
  const finalHealth = currentHealth(sourceRegistry, healthEvents, projectedAt);
  recompute([...associations.incidents.keys()], projectedAt, []);
  const health = finalHealth;
  const incidentRows = [...intelligenceByIncident.values()].sort((left, right) => left.incident.id.localeCompare(right.incident.id));
  const relation = relationProjection(relations), associationRows = [...associations.eventAssociations.entries()].map(([eventId, value]) => ({ eventId, ...value })).sort((left, right) => left.eventId.localeCompare(right.eventId));
  const controlPlane = projectControlPlaneEvents(visible), core = {
    schemaVersion: 'vigia.operational-twin.v1', asOf: projectedAt, eventCount: visible.length, futureEventCountExcluded: Math.max(0, events.length - visible.length), incidents: incidentRows,
    sourceHealth: health, controlPlane, associations: associationRows, relationHistory: relation.history, transitions,
    materialChanges: [...new Map([...materialChanges, ...sourceChanges(transitions)].map(item => [item.id, item])).values()].sort((a,b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)),
    failures: [...relation.failures, ...associations.ambiguities.map((item) => ({ code: 'AMBIGUOUS_INCIDENT_ASSOCIATION', ...item }))]
  };
  return immutable({ ...core, projectionHash: semanticHash('operational-twin', core) });
}

export function twinIncident(twin, incidentId) { return twin.incidents.find((item) => item.incident.id === incidentId) ?? null; }
