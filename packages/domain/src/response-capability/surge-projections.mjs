import { deriveFireSurgeInput, deriveMedicalSurgeInput } from './surge-estimator.mjs';
import {
  FIRE_SURGE_RESOURCE_TYPES, finiteCount, isoOrNull, textOrNull,
} from './capacity-contract.mjs';

function sourceForScenario(input) {
  const raw = input?.source;
  const name = textOrNull(typeof raw === 'string' ? raw : raw?.name ?? raw?.provider ?? input?.provider);
  const reference = textOrNull(typeof raw === 'object' ? raw?.reference ?? raw?.sourceReference : input?.sourceReference);
  return name && reference ? { name, reference } : null;
}

function numericRange(value) {
  const candidate = Array.isArray(value) ? value : [value?.min, value?.max];
  if (!Array.isArray(candidate) || candidate.length !== 2) return null;
  const min = finiteCount(candidate[0]);
  const max = finiteCount(candidate[1]);
  return min !== null && max !== null && max >= min ? { min, max } : null;
}

function withheldScenario(schemaVersion, kind, generatedAt, requiredInputs) {
  return {
    schemaVersion,
    state: 'WITHHELD_INSUFFICIENT_GOVERNED_INPUT',
    generatedAt,
    scenarios: [],
    reason: `No admitted, attributable ${kind} scenario input satisfies the projection contract.`,
    owner: 'response-capability-resolver',
    source: null,
    checkedAt: generatedAt,
    nextCheckAt: null,
    requiredInputs,
    unlockCondition: `Admit the required attributable ${kind} scenario inputs with ranges, assumptions, confidence, invalidation conditions, and a valid observation time.`,
    deterministic: false,
    executionClaimed: false
  };
}

export function medicalSurgeProjection(input, generatedAt) {
  input = deriveMedicalSurgeInput(input);
  const requiredInputs = ['LOW/MODERATE/HIGH demand ranges', 'assumptions', 'confidence', 'invalidation conditions', 'attributable source/reference', 'admission reference', 'updatedAt', 'future validUntil'];
  const source = sourceForScenario(input);
  const updatedAt = isoOrNull(input?.updatedAt ?? input?.observedAt);
  const validUntil = isoOrNull(input?.validUntil);
  const admitted = input?.admitted === true || String(input?.admissionState ?? '').toUpperCase() === 'ADMITTED';
  const admissionReference = textOrNull(input?.admissionReference);
  const supplied = Array.isArray(input?.scenarios) ? input.scenarios : [];
  const byLevel = new Map(supplied.map((scenario) => [String(scenario.level ?? scenario.state ?? '').toUpperCase(), scenario]));
  const scenarios = ['LOW', 'MODERATE', 'HIGH'].map((level) => {
    const scenario = byLevel.get(level);
    const range = numericRange(scenario?.range ?? scenario?.possibleDemandRange);
    const assumptions = Array.isArray(scenario?.assumptions) ? scenario.assumptions.map(textOrNull).filter(Boolean) : [];
    const invalidatedBy = Array.isArray(scenario?.invalidatedBy ?? scenario?.whatWouldInvalidate) ? (scenario.invalidatedBy ?? scenario.whatWouldInvalidate).map(textOrNull).filter(Boolean) : [];
    const confidence = textOrNull(scenario?.confidence?.state ?? scenario?.confidence);
    return scenario && range && assumptions.length && invalidatedBy.length && confidence ? { level, range, unit: textOrNull(scenario.unit) ?? 'PEOPLE_REQUIRING_MEDICAL_SUPPORT', assumptions, confidence: { state: confidence, score: null }, invalidatedBy } : null;
  });
  if (!input || !admitted || !admissionReference || !source || !updatedAt || !validUntil || Date.parse(updatedAt) > Date.parse(generatedAt) || Date.parse(validUntil) <= Date.parse(generatedAt) || scenarios.some((scenario) => !scenario)) {
    return withheldScenario('vigia.medical-surge-scenario.v1', 'medical-surge', generatedAt, requiredInputs);
  }
  return {
    schemaVersion: 'vigia.medical-surge-scenario.v1',
    state: 'ADMITTED_SCENARIO_RANGES',
    generatedAt,
    updatedAt,
    validUntil,
    source,
    admissionReference,
    derivation: input.derivation ?? { kind: 'SUPPLIED_ADMITTED_SCENARIO_RANGES', hiddenCoefficients: null },
    scenarios,
    deterministic: false,
    exactCasualtyPrediction: false,
    executionClaimed: false,
    truthBoundary: 'These are admitted scenario ranges, not observed casualties, a deterministic forecast, or a resource order.'
  };
}

export function fireSurgeProjection(input, generatedAt) {
  input = deriveFireSurgeInput(input);
  const requiredInputs = ['requirement ranges for engines/tankers/crews/command/medical/water/air support', 'available/en-route/committed ranges', 'assumptions', 'confidence', 'invalidation conditions', 'attributable source/reference', 'admission reference', 'updatedAt', 'future validUntil'];
  const source = sourceForScenario(input);
  const updatedAt = isoOrNull(input?.updatedAt ?? input?.observedAt);
  const validUntil = isoOrNull(input?.validUntil);
  const admitted = input?.admitted === true || String(input?.admissionState ?? '').toUpperCase() === 'ADMITTED';
  const admissionReference = textOrNull(input?.admissionReference);
  const assumptions = Array.isArray(input?.assumptions) ? input.assumptions.map(textOrNull).filter(Boolean) : [];
  const invalidatedBy = Array.isArray(input?.invalidatedBy ?? input?.whatWouldInvalidate) ? (input.invalidatedBy ?? input.whatWouldInvalidate).map(textOrNull).filter(Boolean) : [];
  const confidence = textOrNull(input?.confidence?.state ?? input?.confidence);
  const rows = FIRE_SURGE_RESOURCE_TYPES.map((resourceType) => {
    const requirement = numericRange(input?.requirements?.[resourceType]);
    const available = numericRange(input?.available?.[resourceType]);
    const enRoute = numericRange(input?.enRoute?.[resourceType]);
    const committed = numericRange(input?.committed?.[resourceType]);
    if (!requirement || !available || !enRoute || !committed) return null;
    const effectiveMin = Math.max(0, available.min + enRoute.min - committed.max);
    const effectiveMax = Math.max(0, available.max + enRoute.max - committed.min);
    return {
      resourceType,
      required: requirement,
      available,
      enRoute,
      committed,
      gap: { min: Math.max(0, requirement.min - effectiveMax), max: Math.max(0, requirement.max - effectiveMin) }
    };
  });
  if (!input || !admitted || !admissionReference || !source || !updatedAt || !validUntil || Date.parse(updatedAt) > Date.parse(generatedAt) || Date.parse(validUntil) <= Date.parse(generatedAt) || !assumptions.length || !invalidatedBy.length || !confidence || rows.some((row) => !row)) {
    return withheldScenario('vigia.fire-response-surge-scenario.v1', 'fire-response-surge', generatedAt, requiredInputs);
  }
  return {
    schemaVersion: 'vigia.fire-response-surge-scenario.v1',
    state: 'ADMITTED_SCENARIO_RANGES',
    generatedAt,
    updatedAt,
    validUntil,
    source,
    admissionReference,
    derivation: input.derivation ?? { kind: 'SUPPLIED_ADMITTED_RESOURCE_RANGES', hiddenCoefficients: null },
    assumptions,
    confidence: { state: confidence, score: null },
    invalidatedBy,
    resources: rows,
    deterministic: false,
    dispatchClaimed: false,
    executionClaimed: false,
    truthBoundary: 'Required, available, en-route, committed, and gap values are scenario ranges from admitted inputs. No resource dispatch, reservation, acknowledgement, arrival, or outcome is claimed.'
  };
}

