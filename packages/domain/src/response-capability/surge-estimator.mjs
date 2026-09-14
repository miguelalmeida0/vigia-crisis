const LEVELS = Object.freeze(['LOW', 'MODERATE', 'HIGH']);
const RESOURCES = Object.freeze(['engines', 'tankers', 'crews', 'commandUnits', 'medicalSupport', 'waterSupport', 'airSupport']);

const count = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const range = (value) => {
  const candidate = Array.isArray(value) ? value : [value?.min, value?.max];
  const min = count(candidate?.[0]);
  const max = count(candidate?.[1]);
  return min !== null && max !== null && max >= min ? { min, max } : null;
};

const sourceReference = (value) => typeof value?.source?.reference === 'string' && value.source.reference.trim()
  ? value.source.reference.trim() : null;

function multiplyRanges(left, right) {
  return {
    min: Math.max(0, Math.floor(left.min * right.min)),
    max: Math.max(0, Math.ceil(left.max * right.max))
  };
}

/**
 * Computes bounded medical-demand scenarios only from admitted population and
 * scenario-rate ranges. VIGIA supplies no hidden coefficient or casualty rate.
 */
export function deriveMedicalSurgeInput(input) {
  if (!input || Array.isArray(input.scenarios) || input.derivation?.kind !== 'ADMITTED_DRIVER_RANGES') return input;
  const drivers = input.governedDrivers;
  const population = range(drivers?.populationAtRisk);
  const populationSource = sourceReference(drivers?.populationAtRisk);
  const rates = drivers?.medicalSupportRateByScenario;
  if (!population || !populationSource || !rates) return input;
  const scenarios = LEVELS.map((level) => {
    const rate = range(rates[level]);
    const rateSource = sourceReference(rates[level]);
    if (!rate || !rateSource || rate.max > 1) return null;
    return {
      level,
      range: multiplyRanges(population, rate),
      unit: 'PEOPLE_REQUIRING_MEDICAL_SUPPORT',
      assumptions: [
        ...(Array.isArray(input.assumptions) ? input.assumptions : []),
        `Population-at-risk range source: ${populationSource}`,
        `${level} medical-support rate source: ${rateSource}`
      ],
      confidence: input.confidence,
      invalidatedBy: input.invalidatedBy ?? input.whatWouldInvalidate
    };
  });
  return scenarios.some((item) => !item) ? input : {
    ...input,
    scenarios,
    derivation: {
      kind: 'ADMITTED_RANGE_MULTIPLICATION',
      hiddenCoefficients: false,
      populationSource,
      rateSources: Object.fromEntries(LEVELS.map((level) => [level, sourceReference(rates[level])]))
    }
  };
}

/**
 * Computes required response-resource ranges from an admitted incident-scale
 * range and attributable per-scale coefficients. Availability, commitment and
 * en-route values remain caller-supplied governed ranges.
 */
export function deriveFireSurgeInput(input) {
  if (!input || input.requirements || input.derivation?.kind !== 'ADMITTED_DRIVER_RANGES') return input;
  const drivers = input.governedDrivers;
  const scale = range(drivers?.incidentScale);
  const scaleSource = sourceReference(drivers?.incidentScale);
  if (!scale || !scaleSource) return input;
  const requirements = {};
  const coefficientSources = {};
  for (const resource of RESOURCES) {
    const coefficient = range(drivers?.resourceCoefficients?.[resource]);
    const reference = sourceReference(drivers?.resourceCoefficients?.[resource]);
    if (!coefficient || !reference) return input;
    requirements[resource] = multiplyRanges(scale, coefficient);
    coefficientSources[resource] = reference;
  }
  return {
    ...input,
    requirements,
    assumptions: [
      ...(Array.isArray(input.assumptions) ? input.assumptions : []),
      `Incident-scale range source: ${scaleSource}`,
      'Every resource coefficient is supplied with an attributable source; VIGIA adds no hidden coefficient.'
    ],
    derivation: {
      kind: 'ADMITTED_RANGE_MULTIPLICATION',
      hiddenCoefficients: false,
      scaleSource,
      coefficientSources
    }
  };
}

export const SURGE_ESTIMATION_CONTRACT = Object.freeze({
  medicalLevels: LEVELS,
  fireResources: RESOURCES,
  hiddenCoefficientsPermitted: false,
  exactCasualtyPredictionPermitted: false
});
