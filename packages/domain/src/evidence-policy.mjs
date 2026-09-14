const STAGE_ORDER = Object.freeze({
  observed: 1,
  reported: 2,
  corroborated: 3,
  verified: 4,
  active: 5,
  contained: 6,
  closed: 7
});

export function classifyEvidence(evidence = []) {
  const usable = evidence.filter((item) => item?.state !== 'unavailable');
  const supporting = usable.filter((item) => item?.supports === true);
  const contradicting = usable.filter((item) => item?.supports === false && item?.kind === 'contradiction');
  const independentSources = new Set(supporting.map((item) => item.independenceGroup ?? item.source)).size;
  const authoritative = supporting.some((item) => item.authoritative === true);
  const spatiallyCorrelated = supporting.some((item) => item.spatiallyCorrelated === true && item.source !== 'occurrence-report');

  let stage = 'observed';
  if (supporting.some((item) => item.source === 'occurrence-report')) stage = 'reported';
  if (independentSources >= 2 && spatiallyCorrelated) stage = 'corroborated';
  if (authoritative && independentSources >= 2) stage = 'verified';

  return {
    stage,
    stageRank: STAGE_ORDER[stage],
    independentSources,
    supportingCount: supporting.length,
    contradictionCount: contradicting.length,
    authoritative,
    spatiallyCorrelated,
    needsIndependentConfirmation: STAGE_ORDER[stage] < STAGE_ORDER.corroborated,
    contradictions: contradicting.map((item) => item.label)
  };
}

export function canTransitionIncident(from, to) {
  const current = STAGE_ORDER[from];
  const next = STAGE_ORDER[to];
  if (!current || !next) return false;
  if (to === 'closed') return from === 'contained' || from === 'verified' || from === 'reported';
  return next === current + 1;
}

export { STAGE_ORDER };
