import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export const DEFAULT_INPUT_REQUIREMENTS = Object.freeze(['PROGRESSION_SEQUENCE', 'DECODED_WEATHER', 'FUEL_PACK', 'TERRAIN_PACK', 'FUTURE_LABEL']);

const present = (incident, requirement, horizon) => ({
  PROGRESSION_SEQUENCE: ['ARCHIVED_OPERATIONAL_SNAPSHOT', 'DERIVED_PROGRESS_SEQUENCE', 'OFFICIAL_PROGRESS_SEQUENCE'].includes(incident.perimeterSourceClass) && (incident.perimeterStates?.length ?? 0) >= 3,
  DECODED_WEATHER: (incident.weatherRuns ?? []).some((run) => run.valuesDecoded === true && run.qualityState !== 'FAILED'),
  FUEL_PACK: Boolean(incident.fuelPack?.layers?.length),
  TERRAIN_PACK: Boolean(incident.terrainPack?.layers?.length && incident.terrainPack?.verticalDatum),
  FUTURE_LABEL: Boolean((incident.futureLabels ?? []).some((label) => label.horizonHours === horizon && label.qualityState !== 'FAILED')),
}[requirement]);

const providers = { PROGRESSION_SEQUENCE: ['nifc-wfigs-daily', 'nasa-feds'], DECODED_WEATHER: ['noaa-hrrr-archive'], FUEL_PACK: ['usfs-landfire'], TERRAIN_PACK: ['usfs-landfire'], FUTURE_LABEL: ['nifc-wfigs-daily', 'nasa-feds'] };

export function deriveIncidentDataGaps({ incident, horizons = [1, 3, 6, 12, 24], requirements = DEFAULT_INPUT_REQUIREMENTS } = {}) {
  const gaps = [];
  for (const horizon of horizons) for (const requirement of requirements) if (!present(incident, requirement, horizon)) {
    const core = { incidentId: incident.id, region: incident.region, horizonHours: horizon, requirement, state: 'OPEN', candidateProviders: providers[requirement], blocker: requirement === 'DECODED_WEATHER' && (incident.weatherRuns?.length ?? 0) ? 'GRIB_FIELD_UNDECODED_OR_UNCERTIFIED' : `MISSING_${requirement}`, unlocks: [`${horizon}H_FORECAST_EXAMPLE`], reasons: uniqueSorted(incident.acquisitionBlockers ?? []) };
    gaps.push({ ...core, id: semanticHash('data-gap', core) });
  }
  return immutable(gaps);
}

export function analyzeGapImpact(gaps = [], examples = []) {
  return immutable(gaps.map((gap) => ({ gapId: gap.id, incidentId: gap.incidentId, requirement: gap.requirement, horizonHours: gap.horizonHours, candidateExamplesUnlocked: examples.filter((item) => item.incidentId === gap.incidentId && item.horizonHours === gap.horizonHours).length || 1, unlocks: gap.unlocks })).sort((a, b) => b.candidateExamplesUnlocked - a.candidateExamplesUnlocked || a.gapId.localeCompare(b.gapId)));
}

export function planDataGapResolution({ gaps = [], providerCapabilities = [], coverage = {}, access = {}, rights = {}, costBudget = {}, timeBudget = {} } = {}) {
  const capabilities = new Map(providerCapabilities.map((item) => [`${item.provider}:${item.requirement}`, item]));
  const plans = gaps.flatMap((gap) => gap.candidateProviders.map((provider) => {
    const capability = capabilities.get(`${provider}:${gap.requirement}`) ?? {}, covered = coverage[provider]?.includes?.(gap.region) ?? capability.covered ?? false, accessible = access[provider] !== false && capability.access !== 'BLOCKED', permitted = rights[provider] !== false && capability.rights !== 'BLOCKED';
    const factors = { gapsClosed: 1, horizonsUnlocked: gap.unlocks.length, providerAvailable: Number(accessible), coverage: Number(covered), rightsReady: Number(permitted), existingPartialData: Number(gap.blocker?.includes('UNDECODED')), retryReady: Number((capability.attempts ?? 0) < (capability.maxAttempts ?? 3)), expectedBytes: Number(capability.expectedBytes ?? 0), expectedLatencyMs: Number(capability.expectedLatencyMs ?? 0) };
    const eligible = covered && accessible && permitted && factors.expectedBytes <= Number(costBudget.maxBytes ?? Infinity) && factors.expectedLatencyMs <= Number(timeBudget.maxLatencyMs ?? Infinity);
    const score = factors.gapsClosed * 1_000 + factors.horizonsUnlocked * 100 + factors.providerAvailable * 50 + factors.coverage * 50 + factors.rightsReady * 50 + factors.existingPartialData * 25 + factors.retryReady * 10 - Math.ceil(factors.expectedBytes / 1_048_576) - Math.ceil(factors.expectedLatencyMs / 1_000);
    return { id: semanticHash('gap-resolution-action', { gapId: gap.id, provider }), gapId: gap.id, incidentId: gap.incidentId, requirement: gap.requirement, provider, eligible, score, factors, blocker: !covered ? 'OUTSIDE_PROVIDER_COVERAGE' : !accessible ? 'BLOCKED_EXTERNAL_ACCESS' : !permitted ? 'RIGHTS_BLOCKED' : null };
  })).sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.id.localeCompare(b.id));
  return immutable({ schemaVersion: 'vigia.gap-resolution-plan.v1', actions: plans, fingerprint: semanticHash('gap-resolution-plan', plans) });
}
