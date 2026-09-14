import { immutable, semanticHash, uniqueSorted } from '../intelligence/shared.mjs';

export function createForecastInputPackage(input = {}) {
  const core = { schemaVersion: 'vigia.forecast-input-package.v1', incidentId: input.incidentId, issueTime: new Date(input.issueTime).toISOString(), horizonHours: Number(input.horizonHours), knowledgeTimeCutoff: new Date(input.knowledgeTimeCutoff).toISOString(), perimeterStateIds: uniqueSorted(input.perimeterStateIds), physicalObservationIds: uniqueSorted(input.physicalObservationIds), weatherSliceIds: uniqueSorted(input.weatherSliceIds), fuelPackId: input.fuelPackId ?? null, terrainPackId: input.terrainPackId ?? null, sourceOpportunityIds: uniqueSorted(input.sourceOpportunityIds), futureLabelIds: uniqueSorted(input.futureLabelIds), assetContextIds: uniqueSorted(input.assetContextIds), rightsManifest: structuredClone(input.rightsManifest ?? {}), lineageManifest: structuredClone(input.lineageManifest ?? {}), qualityResults: structuredClone(input.qualityResults ?? {}) };
  for (const time of [core.issueTime, core.knowledgeTimeCutoff]) if (!Number.isFinite(Date.parse(time))) throw new Error('forecast_input_package_time_invalid');
  const fingerprint = semanticHash('forecast-input-package', core);
  return immutable({ ...core, id: fingerprint, fingerprint });
}

export function propagateRights(upstreams = [], { includeRaw = false } = {}) {
  const licenceIds = uniqueSorted(upstreams.flatMap((item) => item.licenceIds ?? [])), rawBlockers = upstreams.filter((item) => includeRaw && item.rawRedistribution !== true).map((item) => item.id), derivedBlockers = upstreams.filter((item) => !includeRaw && item.derivedRedistribution !== true).map((item) => item.id);
  const blockers = uniqueSorted([...rawBlockers, ...derivedBlockers]);
  return immutable({ schemaVersion: 'vigia.rights-manifest.v1', allowed: !blockers.length, includeRaw, licenceIds, attributions: uniqueSorted(upstreams.flatMap((item) => item.attributions ?? [])), blockers, blockedContentReport: blockers.map((id) => ({ upstreamId: id, reason: includeRaw ? 'RAW_REDISTRIBUTION_NOT_PERMITTED' : 'DERIVED_REDISTRIBUTION_NOT_PERMITTED' })), fingerprint: semanticHash('rights-manifest', { includeRaw, licenceIds, blockers }) });
}
