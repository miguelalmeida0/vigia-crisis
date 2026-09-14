import { immutable } from '../intelligence/shared.mjs';

// This is a reading of the existing evidence contract, never a second admission gate.
export function assessOperationalIncident({ incident, evidenceGraph, evaluation, asOf }) {
  const support = evaluation.qualifyingEvidence ?? [], excluded = evaluation.excludedEvidence ?? [];
  const conflicts = (evaluation.contradictions ?? []).filter(item => item.blocking);
  const families = evaluation.independentFamilies ?? [];
  const official = support.filter(item => item.familyClass === 'OFFICIAL');
  const physical = support.filter(item => item.familyClass === 'PHYSICAL');
  const physicalFamilies = families.filter(item => item.familyClass === 'PHYSICAL');
  const stale = excluded.some(item => item.classification === 'STALE');
  const corroborationState = conflicts.length ? 'CONFLICTING' : official.length ? 'OFFICIAL_CONFIRMED'
    : physicalFamilies.length >= 2 ? 'MULTI_SOURCE' : physical.length ? 'SINGLE_SOURCE' : stale ? 'STALE' : 'UNCONFIRMED';
  const reasons = [];
  if (physical.length) reasons.push('Current qualifying physical evidence exists.');
  if (!official.length) reasons.push('No current qualifying official confirmation.');
  if (physicalFamilies.length < 2) reasons.push('A second independent physical source family is absent.');
  if (stale) reasons.push('Older evidence is excluded by the existing freshness contract.');
  if (excluded.some(item => item.classification === 'SOURCE_EXCLUDED')) reasons.push('An evidence source is excluded by the current source-health contract.');
  if (conflicts.length) reasons.push('Attributable evidence conflicts; human review is required.');
  if (official.length) reasons.push('An official observation qualifies under the existing evidence contract.');
  const observations = evidenceGraph.observations ?? [], sources = evidenceGraph.sources ?? [];
  const lineage = observations.map(observation => {
    const source = sources.find(item => item.id === observation.sourceId);
    const family = evidenceGraph.sourceFamilies.find(item => item.id === source?.familyId);
    const causal = evidenceGraph.lineages.find(item => item.observationId === observation.id);
    return { observationId: observation.id, provider: source?.metadata?.producerId ?? source?.id ?? null,
      product: observation.value?.product ?? null, upstreamSource: source?.metadata?.upstreamOrigin ?? null,
      sensorFamily: source?.familyId ?? null, observationFamily: family?.familyClass ?? null,
      authorityClass: family?.familyClass === 'OFFICIAL' ? 'OFFICIAL_SOURCE' : 'NON_OFFICIAL',
      causalKeys: causal?.causalKeys ?? [], rootObservationIds: causal?.rootObservationIds ?? [] };
  });
  const heat = physical.some(item => /thermal|viirs|firms/i.test(item.sourceFamilyId ?? ''));
  const summary = conflicts.length ? 'Sources disagree. Resolve the conflicting evidence before a stronger conclusion.'
    : official.length ? 'Official incident evidence is confirmed under the evidence contract; operational admission remains separate.'
      : physicalFamilies.length >= 2 ? 'Independent physical corroboration is present. Official confirmation remains separate.'
        : heat ? 'Heat detected. Current fire presence is not independently confirmed.'
          : physical.length ? 'A physical signal exists. Current fire presence is not independently confirmed.'
            : stale ? 'Earlier evidence is stale. Current fire presence is not confirmed.' : 'Current fire presence is unconfirmed.';
  return immutable({ incidentId: incident.id, generatedAt: asOf, verificationState: evaluation.state,
    freshnessState: support.length ? 'CURRENT_QUALIFYING_SUPPORT' : stale ? 'STALE' : 'NO_CURRENT_QUALIFYING_SUPPORT',
    corroborationState, officialState: official.length ? 'QUALIFYING_OFFICIAL_EVIDENCE' : 'NO_CURRENT_CONFIRMATION',
    geometryState: 'INCIDENT_LOCATION_ONLY_NOT_A_PERIMETER', conflictState: conflicts.length ? 'UNRESOLVED' : 'NO_BLOCKING_CONFLICT',
    sourceCoverage: { recordedSources: sources.length, independentQualifyingFamilies: families.length, independentPhysicalFamilies: physicalFamilies.length },
    summary, reasons, evidenceIds: support.map(item => item.evidenceId).sort(), conflictingEvidenceIds: conflicts.map(item => item.evidenceId).sort(), lineage,
    explanation: { output: corroborationState, reasons, evidenceIds: support.map(item => item.evidenceId).sort(),
      ruleIds: ['OP-ASSESSMENT-1', evaluation.contract.id + ':' + evaluation.contract.version], generatedAt: asOf },
    boundary: 'Assessment is not operational promotion, perimeter admission, a dispatch, or an outcome.' });
}
