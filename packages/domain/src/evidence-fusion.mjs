const PHYSICAL_TYPES = new Set(['thermal', 'camera', 'ground_sensor', 'drone', 'field']);

function family(item) {
  if (item.independenceGroup) return String(item.independenceGroup);
  if (item.sourceFamily) return String(item.sourceFamily);
  if (item.type === 'thermal') return String(item.satellite || item.instrument || item.source || 'thermal').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `${item.type}:${item.sensorId || item.instrument || item.source || 'unknown'}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, '_');
}
function newest(items) { return [...items].sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0] ?? null; }
function polarity(item) {
  const value = String(item.classification ?? item.metadata?.classification ?? '').toLowerCase();
  if (/(no[_ -]?(fire|smoke|heat)|false[_ -]?alarm|non[_ -]?fire|clear)/.test(value)) return 'negative';
  if (/(fire|flame|smoke|thermal|hotspot|heat|combust)/.test(value)) return 'support';
  return 'undetermined';
}
function calibrationEvidence(calibration) {
  const evidence = calibration?.validationEvidence;
  return calibration?.validated === true && calibration?.id && evidence?.datasetId && evidence?.approvedBy
    && Number.isFinite(Date.parse(evidence?.approvedAt)) && evidence?.scope && typeof calibration?.likelihoodRatios === 'object';
}

export function fuseEventEvidence(observations = [], { calibration = null } = {}) {
  const physical = observations.filter((item) => PHYSICAL_TYPES.has(item.type));
  const reports = observations.filter((item) => ['report', 'report_update'].includes(item.type));
  const groups = new Map();
  for (const item of physical) { const key = family(item); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
  const witnesses = [...groups.entries()].map(([key, items]) => {
    const latest = newest(items);
    return {
      dependencyGroup: key, observationCount: items.length, latestAt: latest?.at ?? null, source: latest?.source ?? null, type: latest?.type ?? null,
      sourceFamily: latest?.sourceFamily ?? null,
      measurementType: latest?.measurementType ?? null,
      nativeConfidence: latest?.confidence ?? null, nativeConfidenceDefinition: latest?.metadata?.confidenceDefinition ?? null,
      platform: latest?.platform ?? latest?.satellite ?? null, instrument: latest?.instrument ?? latest?.sensorId ?? null,
      processingChain: latest?.metadata?.processingChain ?? null, polarity: polarity(latest)
    };
  }).sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
  const independentFamilies = witnesses.length;
  const evidenceStrength = independentFamilies >= 3 ? 'multiple_dependency_groups' : independentFamilies === 2 ? 'two_dependency_groups' : independentFamilies === 1 ? 'single_dependency_group' : reports.length ? 'report_only' : 'none';
  const dependencies = [...groups.entries()].filter(([, items]) => items.length > 1).map(([key, items]) => ({ dependencyGroup: key, observationIds: items.map((item) => item.id), note: 'Repeated observations in one declared dependency group are not counted as independent sensors.' }));
  const supported = witnesses.filter((item) => item.polarity === 'support'), negative = witnesses.filter((item) => item.polarity === 'negative');
  const inadmissibleNegative = physical.filter((item) => polarity(item) === 'negative' && item.metadata?.negativeEvidenceEligible !== true);
  const ambiguities = [];
  if (supported.length && negative.length) ambiguities.push({ kind: 'conflicting_physical_observations', supportGroups: supported.map((item) => item.dependencyGroup), negativeGroups: negative.map((item) => item.dependencyGroup) });
  if (inadmissibleNegative.length) ambiguities.push({ kind: 'negative_claim_without_exact_coverage', observationIds: inadmissibleNegative.map((item) => item.id) });
  const fusionState = ambiguities.length ? 'ambiguous' : physical.length ? 'physical_evidence' : reports.length ? 'report_only' : 'empty';
  const base = { state: fusionState, evidenceStrength, independentFamilies, physicalObservationCount: physical.length, reportObservationCount: reports.length, witnesses, dependencies, ambiguities };
  if (!calibrationEvidence(calibration)) return { ...base, calibrated: false, existenceProbability: null, probabilityReason: 'No approved, scoped calibration evidence record is configured; native source confidence is not normalized across sensors.' };
  const prior = Math.max(.001, Math.min(.999, Number(calibration.priorProbability ?? .1))); let odds = prior / (1 - prior);
  for (const witness of witnesses) { const ratio = Number(calibration.likelihoodRatios?.[witness.dependencyGroup]); if (Number.isFinite(ratio) && ratio > 0) odds *= ratio; }
  const probability = odds / (1 + odds);
  return { ...base, calibrated: true, calibrationProfile: calibration.id, calibrationEvidence: structuredClone(calibration.validationEvidence), existenceProbability: Number(probability.toFixed(4)), probabilityReason: 'Probability uses an approved calibration evidence record and declared dependency groups within its stated scope.' };
}
