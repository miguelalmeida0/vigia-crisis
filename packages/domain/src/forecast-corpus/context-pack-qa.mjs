import { isoTime, semanticHash } from '../intelligence/shared.mjs';
import { REQUIRED_FUEL_LAYERS, REQUIRED_TERRAIN_LAYERS } from './constants.mjs';

const contains = (outer, inner) => Array.isArray(outer) && outer.length === 4 && inner && outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
export function validateHistoricalContextPack(pack = {}, { incidentDate, informationCutoff = incidentDate, domainBbox } = {}) {
  const failures = [], kind = String(pack.kind ?? ''), required = kind === 'FUEL' ? REQUIRED_FUEL_LAYERS : kind === 'TERRAIN' ? REQUIRED_TERRAIN_LAYERS : [];
  if (!required.length) failures.push('CONTEXT_KIND_INVALID');
  const referenceDate = isoTime(pack.referenceDate, 'context_reference_date_required');
  if (Date.parse(referenceDate) > Date.parse(isoTime(incidentDate))) failures.push('CURRENT_CONTEXT_REWRITES_HISTORY');
  if (!pack.availableToVigiaAt || Date.parse(pack.availableToVigiaAt) > Date.parse(isoTime(informationCutoff))) failures.push('CONTEXT_NOT_AVAILABLE_AT_ISSUE_TIME');
  if (!pack.datasetId || !pack.version || !pack.resolution || !pack.licenceId || !pack.transformation) failures.push('CONTEXT_METADATA_INCOMPLETE');
  if (kind === 'TERRAIN' && !pack.verticalDatum) failures.push('TERRAIN_VERTICAL_DATUM_MISSING');
  if (!contains(pack.coverage?.bbox, domainBbox)) failures.push('CONTEXT_DOMAIN_NOT_COVERED');
  const layers = pack.layers ?? [], names = new Set(layers.map((layer) => layer.name));
  for (const name of required) if (!names.has(name)) failures.push(`CONTEXT_LAYER_MISSING:${name}`);
  for (const layer of layers) {
    if (!layer.contentHash || !Number.isFinite(Number(layer.bytes)) || Number(layer.bytes) <= 0) failures.push('CONTEXT_LAYER_INTEGRITY_INCOMPLETE');
    if (!layer.nodataPolicy || !layer.units) failures.push('CONTEXT_LAYER_QA_INCOMPLETE');
  }
  const core = { schemaVersion: 'vigia.corpus-context-pack-qa.v1', kind, datasetId: pack.datasetId ?? null, version: pack.version ?? null, referenceDate, failures: [...new Set(failures)].sort() };
  return { ...core, passed: core.failures.length === 0, reportHash: semanticHash('corpus-context-pack-qa', core) };
}
