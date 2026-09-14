import {
  createClaim, createEvidence, createEvidenceGraph, createIncident, createObservation, createSource, createSourceFamily
} from '../intelligence/index.mjs';
import { evaluateEvidenceContract } from '../intelligence/evaluation/evaluate-evidence-contract.mjs';
import { OPERATIONAL_WILDFIRE_CONTRACT_V1 } from './operational-contract.mjs';
import { assessOperationalIncident } from './incident-assessment.mjs';
import {deriveIncidentCurrentness,fireSignal} from './incident-currentness.mjs';

function observedAt(event) { return event.clocks.observedAt ?? event.clocks.occurredAt; }
function sourceKind(familyClass) { return ({ REPORT: 'PUBLISHER', PHYSICAL: 'SENSOR', OFFICIAL: 'OFFICIAL_SYSTEM', HUMAN: 'FIELD_TEAM', CONTEXT: 'PRODUCT' })[familyClass] ?? 'OTHER'; }
function evidenceFamilyClass(familyClass) { return familyClass === 'SYSTEM' ? 'CONTEXT' : familyClass; }
function eventLocation(event, fallback) { return { coordinate: event.geometry?.coordinates ?? fallback.coordinates }; }
function healthBySource(projection) { return new Map((projection?.sources ?? []).map((item) => [item.sourceId, item])); }

function graphComponents(activeEvents, incident, sourceHealth) {
  const familyById = new Map(), sourceById = new Map(), observations = [], evidence = [], health = healthBySource(sourceHealth);
  const activeIds = new Set(activeEvents.map((event) => event.id));
  const resolved = new Set(activeEvents.flatMap((event) => event.payload?.resolvesEventIds ?? []));
  for (const event of activeEvents) {
    const source = event.source, status = health.get(source.sourceId)?.status ?? 'ACTIVE';
    if (!familyById.has(source.familyId)) familyById.set(source.familyId, createSourceFamily({ id: source.familyId, familyClass: evidenceFamilyClass(source.familyClass), label: source.familyId, metadata: { operationalEventSource: true, operationalFamilyClass:source.familyClass } }));
    if (!sourceById.has(source.sourceId)) sourceById.set(source.sourceId, createSource({
      id: source.sourceId, familyId: source.familyId, kind: sourceKind(source.familyClass), label: source.sourceId, status,
      metadata: { producerId: source.producerId, upstreamOrigin: source.upstreamOrigin }
    }));
    const observationId = `observation:${event.id}`;
    observations.push(createObservation({
      id: observationId, sourceId: source.sourceId, observedAt: observedAt(event),
      state: event.payload?.observationState ?? 'OBSERVED_UNDETERMINED', location: eventLocation(event, incident.location),
      opportunity: event.payload?.opportunity ?? { state: 'VALID', reason: 'Positive attributable observation.' },
      upstreamMeasurementId: event.provenance?.upstreamMeasurementId,
      derivedFromObservationIds: (event.provenance?.derivedFromEventIds ?? []).filter((id) => activeIds.has(id)).map((id) => `observation:${id}`),
      value: event.payload, provenance: { operationalEventId: event.id, ...event.provenance }
    }));
    evidence.push(createEvidence({
      id: `evidence:${event.id}`, claimId: `claim:${incident.id}:wildfire-presence`, observationId,
      stance: event.payload?.stance ?? 'IRRELEVANT', provenanceStrength: event.provenance?.strength ?? 'UNKNOWN',
      materiality: event.payload?.materiality ?? 'MATERIAL', contradictionStatus: resolved.has(event.id) ? 'RESOLVED' : 'UNRESOLVED',
      rationale: `Projected from canonical operational event ${event.id}.`, provenance: { operationalEventId: event.id }
    }));
  }
  return { sourceFamilies: [...familyById.values()], sources: [...sourceById.values()], observations, evidence };
}

export function buildIncidentIntelligence({ incident, activeEvents, historicalEvents, sourceHealth, asOf, previousEvaluation = null, currentnessPolicy = {} }) {
  const contract = OPERATIONAL_WILDFIRE_CONTRACT_V1, times = historicalEvents.map(observedAt).filter(Boolean).sort();
  const validFrom = times[0] ?? incident.openedAt, validTo = times.at(-1) ?? validFrom;
  const canonicalIncident = createIncident({ id: incident.id, incidentType: incident.hazardType, openedAt: incident.openedAt, location: { coordinate: incident.location.coordinates }, claimIds: [`claim:${incident.id}:wildfire-presence`], status: activeEvents.length ? 'OPEN' : 'CANCELLED' });
  const claim = createClaim({
    id: `claim:${incident.id}:wildfire-presence`, incidentId: incident.id, claimType: 'wildfire.presence',
    proposition: 'A wildfire is present within the incident location and operational time window.', location: { coordinate: incident.location.coordinates },
    validTime: { from: validFrom, to: validTo }, contract: { id: contract.id, version: contract.version }, metadata: { operationalTwin: true }
  });
  const evidenceGraph = createEvidenceGraph(graphComponents(activeEvents, incident, sourceHealth));
  const evaluation = evaluateEvidenceContract({ claim, contract, evidenceGraph, evaluationTime: asOf, previousEvaluation });
  const fireActivityEvents=activeEvents.filter(event=>fireSignal(event,asOf)).map(({id,eventType,hazardType,action,clocks,source,payload,provenance})=>({id,eventType,hazardType,action,clocks,source:{sourceId:source.sourceId,familyClass:source.familyClass},payload:{stance:payload?.stance,observationState:payload?.observationState,officialIncidentStatus:payload?.officialIncidentStatus,incidentStatus:payload?.incidentStatus,resolutionState:payload?.resolutionState,operatorResolution:payload?.operatorResolution},provenance:{synthetic:provenance?.synthetic,upstreamMeasurementId:provenance?.upstreamMeasurementId}}));
  const currentness=deriveIncidentCurrentness({events:fireActivityEvents,asOf,policy:currentnessPolicy,reviewReasons:evaluation.contradictions?.some(c=>c.blocking)?['Unresolved incident-specific conflict']:[]});
  return {
    currentness,fireActivityEvents,
    incident: canonicalIncident, claim, contract: { id: contract.id, version: contract.version, fingerprint: contract.fingerprint },
    evidenceGraph, evaluation, evidenceDebt: evaluation.evidenceDebt,
    assessment: assessOperationalIncident({ incident: canonicalIncident, evidenceGraph, evaluation, asOf }),
    eventIds: historicalEvents.map((event) => event.id).sort(), activeEventIds: activeEvents.map((event) => event.id).sort()
  };
}
