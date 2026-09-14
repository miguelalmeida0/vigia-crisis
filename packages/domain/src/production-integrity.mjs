const SYNTHETIC_MARKER = /(?:^|[^a-z])(fixture|synthetic|mock|fake|demo)(?:[^a-z]|$)/i;

export class ProductionIntegrityViolation extends Error {
  constructor(message, evidence = {}) {
    super(message);
    this.name = 'ProductionIntegrityViolation';
    this.code = 'production_integrity_violation';
    this.evidence = structuredClone(evidence);
  }
}

export function syntheticProvenance(value = {}) {
  const provenance = value?.provenance ?? {};
  if (provenance.synthetic === true || value?.synthetic === true || value?.fixture === true) return true;
  return [provenance.universe, provenance.kind, provenance.source, value?.source, value?.sourceState]
    .some((item) => typeof item === 'string' && SYNTHETIC_MARKER.test(item));
}

export function assertObservationAllowed(value, universe = 'test') {
  if (['production', 'replay'].includes(universe) && syntheticProvenance(value)) {
    throw new ProductionIntegrityViolation(`Synthetic observation rejected by the ${universe} integrity boundary.`, {
      observationId: value?.id ?? null,
      source: value?.source ?? null,
      provenance: value?.provenance ?? null,
      universe
    });
  }
  return value;
}

export function productionObservationReality(observations = [], universe = 'production') {
  const synthetic = observations.filter(syntheticProvenance);
  const reports=observations.filter((item)=>item?.type==='report'),physical=observations.filter((item)=>['thermal','camera','ground_sensor','drone','field'].includes(item?.type));
  return {
    universe,
    totalObservations: observations.length,
    totalEventObservations: observations.length,
    physicalObservations: physical.length,
    reportObservations: reports.length,
    otherObservations: observations.length-physical.length-reports.length,
    syntheticObservations: synthetic.length,
    syntheticObservationIds: synthetic.map((item) => item.id ?? null).filter(Boolean)
  };
}
