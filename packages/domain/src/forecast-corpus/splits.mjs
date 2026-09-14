import { createHash } from 'node:crypto';
import { immutable, semanticHash } from '../intelligence/shared.mjs';
import { CORPUS_SPLITS } from './constants.mjs';

const bucket = (value) => Number.parseInt(createHash('sha256').update(String(value)).digest('hex').slice(0, 8), 16) % 100;
export function assignCorpusSplits(cases = [], { geographicStressRegion, seasonalStressSeason, splitVersion = '1.0.0' } = {}) {
  const incidentGroups = new Map();
  for (const item of cases) { const rows = incidentGroups.get(item.incidentId) ?? []; rows.push(item); incidentGroups.set(item.incidentId, rows); }
  const assignments = [];
  for (const [incidentId, rows] of [...incidentGroups].sort(([a], [b]) => a.localeCompare(b))) {
    const regions = new Set(rows.map((row) => row.region)), seasons = new Set(rows.map((row) => row.season)); let split;
    if (regions.has(geographicStressRegion)) split = 'geographic-stress-test';
    else if (seasons.has(seasonalStressSeason)) split = 'seasonal-stress-test';
    else { const value = bucket(`${splitVersion}:${incidentId}`); split = value < 70 ? 'development' : value < 85 ? 'calibration' : 'held-out-test'; }
    assignments.push({ incidentId, split, exampleIds: rows.map((row) => row.id).sort() });
  }
  const assigned = cases.map((item) => ({ ...item, split: assignments.find((row) => row.incidentId === item.incidentId).split })).sort((a, b) => a.id.localeCompare(b.id));
  const counts = Object.fromEntries(CORPUS_SPLITS.map((split) => [split, assigned.filter((item) => item.split === split).length]));
  const core = { schemaVersion: 'vigia.corpus-splits.v1', splitVersion, geographicStressRegion: geographicStressRegion ?? null, seasonalStressSeason: seasonalStressSeason ?? null, assignments, counts };
  return immutable({ ...core, cases: assigned, fingerprint: semanticHash('corpus-splits', core) });
}

const isolationKeys = Object.freeze(['upstreamObservationIds', 'physicalPixelIds', 'providerRepublicationIds', 'geometryDuplicateGroupIds', 'persistentAnomalySiteIds']);
export function assignCorpusSplitsV2(cases = [], { geographicStressRegion, seasonalStressSeason, splitVersion = 'knowledge-time-split-v2-causal-isolation' } = {}) {
  const parent = new Map(cases.map((item) => [item.id, item.id]));
  const find = (id) => { let root = parent.get(id); while (root !== parent.get(root)) root = parent.get(root); for (let cursor = id; parent.get(cursor) !== root;) { const next = parent.get(cursor); parent.set(cursor, root); cursor = next; } return root; };
  const union = (a, b) => { const left = find(a), right = find(b); if (left !== right) parent.set(left < right ? right : left, left < right ? left : right); };
  const byEntity = new Map();
  for (const row of cases) {
    const entities = [`incident:${row.incidentId}`, ...isolationKeys.flatMap((key) => [row[key]].flat().filter(Boolean).map((value) => `${key}:${value}`))];
    for (const entity of entities) { const prior = byEntity.get(entity); if (prior) union(row.id, prior); else byEntity.set(entity, row.id); }
  }
  const groups = new Map(); for (const row of cases) { const root = find(row.id), rows = groups.get(root) ?? []; rows.push(row); groups.set(root, rows); }
  const assignments = [];
  for (const rows of [...groups.values()].sort((a, b) => a[0].id.localeCompare(b[0].id))) {
    const incidentIds = [...new Set(rows.map((row) => row.incidentId))].sort(), regions = new Set(rows.map((row) => row.region)), seasons = new Set(rows.map((row) => row.season)), groupKey = incidentIds.join('|'); let split;
    if (regions.has(geographicStressRegion)) split = 'geographic-stress-test'; else if (seasons.has(seasonalStressSeason)) split = 'seasonal-stress-test'; else { const value = bucket(`${splitVersion}:${groupKey}`); split = value < 70 ? 'development' : value < 85 ? 'calibration' : 'held-out-test'; }
    assignments.push({ groupId: semanticHash('corpus-isolation-group', { incidentIds, exampleIds: rows.map((row) => row.id).sort() }), incidentIds, split, exampleIds: rows.map((row) => row.id).sort(), isolationDoctrine: ['incident', 'physical observation', 'provider republication', 'persistent anomaly site', 'near-duplicate geometry'] });
  }
  const splitById = new Map(assignments.flatMap((assignment) => assignment.exampleIds.map((id) => [id, assignment.split]))), assigned = cases.map((item) => ({ ...item, split: splitById.get(item.id) })).sort((a, b) => a.id.localeCompare(b.id)), counts = Object.fromEntries(CORPUS_SPLITS.map((split) => [split, assigned.filter((item) => item.split === split).length]));
  const core = { schemaVersion: 'vigia.corpus-splits.v2', splitVersion, geographicStressRegion: geographicStressRegion ?? null, seasonalStressSeason: seasonalStressSeason ?? null, isolationKeys, assignments, counts };
  return immutable({ ...core, cases: assigned, fingerprint: semanticHash('corpus-splits-v2', core) });
}
