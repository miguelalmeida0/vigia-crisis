import { compareIds, immutable, stableStringify, uniqueSorted } from '../shared.mjs';

function deduplicate(records, kind) {
  const byId = new Map();
  for (const record of records ?? []) {
    if (!record?.id) throw new Error(`${kind}_id_required`);
    const existing = byId.get(String(record.id));
    if (existing && stableStringify(existing) !== stableStringify(record)) throw new Error(`conflicting_duplicate_${kind}`);
    if (!existing) byId.set(String(record.id), structuredClone(record));
  }
  return [...byId.values()].sort(compareIds);
}

function assertReferences(records, reference, selectIds, code) {
  for (const record of records) for (const id of selectIds(record)) if (!reference.has(id)) throw new Error(`${code}:${id}`);
}

function assertAcyclic(records, selectIds, code) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error(code);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of selectIds(byId.get(id))) visit(next);
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
}

function sourceAncestors(sourceId, sourceById, pending = new Set()) {
  if (pending.has(sourceId)) throw new Error('source_lineage_cycle');
  const source = sourceById.get(sourceId);
  const next = new Set(pending).add(sourceId), ids = [sourceId];
  for (const upstreamId of source.upstreamSourceIds ?? []) ids.push(...sourceAncestors(upstreamId, sourceById, next));
  return uniqueSorted(ids);
}

function observationLineage(observationId, observationById, sourceById, pending = new Set(), cache = new Map()) {
  if (cache.has(observationId)) return cache.get(observationId);
  if (pending.has(observationId)) throw new Error('observation_lineage_cycle');
  const observation = observationById.get(observationId);
  if (!observation) throw new Error(`observation_not_found:${observationId}`);
  const next = new Set(pending).add(observationId), parents = observation.derivedFromObservationIds ?? [];
  let rootObservationIds, causalKeys, sourceFamilyIds, sourceIds;
  if (!parents.length) {
    const source = sourceById.get(observation.sourceId);
    rootObservationIds = [observation.id];
    causalKeys = [observation.upstreamMeasurementId ? `measurement:${observation.upstreamMeasurementId}` : `observation:${observation.id}`];
    sourceFamilyIds = [source.familyId]; sourceIds = sourceAncestors(source.id, sourceById);
  } else {
    const upstream = parents.map((id) => observationLineage(id, observationById, sourceById, next, cache));
    rootObservationIds = uniqueSorted(upstream.flatMap((item) => item.rootObservationIds));
    causalKeys = uniqueSorted(upstream.flatMap((item) => item.causalKeys));
    sourceFamilyIds = uniqueSorted(upstream.flatMap((item) => item.sourceFamilyIds));
    sourceIds = uniqueSorted([observation.sourceId, ...sourceAncestors(observation.sourceId, sourceById), ...upstream.flatMap((item) => item.sourceIds)]);
  }
  const lineage = { schemaVersion: 'vigia.evidence-lineage.v1', observationId, rootObservationIds, causalKeys, sourceFamilyIds, sourceIds };
  cache.set(observationId, lineage); return lineage;
}

export function createEvidenceGraph(input = {}) {
  const sourceFamilies = deduplicate(input.sourceFamilies, 'source_family');
  const sources = deduplicate(input.sources, 'source');
  const observations = deduplicate(input.observations, 'observation');
  const evidence = deduplicate(input.evidence, 'evidence');
  const familyById = new Map(sourceFamilies.map((item) => [item.id, item]));
  const sourceById = new Map(sources.map((item) => [item.id, item]));
  const observationById = new Map(observations.map((item) => [item.id, item]));
  assertReferences(sources, familyById, (item) => [item.familyId], 'source_family_not_found');
  assertReferences(sources, sourceById, (item) => item.upstreamSourceIds ?? [], 'upstream_source_not_found');
  assertReferences(observations, sourceById, (item) => [item.sourceId], 'observation_source_not_found');
  assertReferences(observations, observationById, (item) => item.derivedFromObservationIds ?? [], 'upstream_observation_not_found');
  assertReferences(evidence, observationById, (item) => [item.observationId], 'evidence_observation_not_found');
  assertAcyclic(sources, (item) => item.upstreamSourceIds ?? [], 'source_lineage_cycle');
  assertAcyclic(observations, (item) => item.derivedFromObservationIds ?? [], 'observation_lineage_cycle');
  const cache = new Map();
  const lineages = observations.map((item) => observationLineage(item.id, observationById, sourceById, new Set(), cache)).sort((left, right) => left.observationId.localeCompare(right.observationId));
  const familyByCausalKey = new Map();
  for (const lineage of lineages) {
    if (lineage.sourceFamilyIds.length !== 1) continue;
    for (const key of lineage.causalKeys) {
      const prior = familyByCausalKey.get(key);
      if (prior && prior !== lineage.sourceFamilyIds[0]) throw new Error(`causal_lineage_family_conflict:${key}`);
      familyByCausalKey.set(key, lineage.sourceFamilyIds[0]);
    }
  }
  return immutable({ schemaVersion: 'vigia.evidence-graph.v1', sourceFamilies, sources, observations, evidence, lineages });
}

export function evidenceGraphIndexes(graph) {
  return {
    familyById: new Map(graph.sourceFamilies.map((item) => [item.id, item])),
    sourceById: new Map(graph.sources.map((item) => [item.id, item])),
    observationById: new Map(graph.observations.map((item) => [item.id, item])),
    lineageByObservationId: new Map(graph.lineages.map((item) => [item.observationId, item]))
  };
}

export function evidenceLineage(graph, evidenceId) {
  const evidence = graph.evidence.find((item) => item.id === evidenceId);
  if (!evidence) throw new Error(`evidence_not_found:${evidenceId}`);
  const lineage = graph.lineages.find((item) => item.observationId === evidence.observationId);
  return immutable({ ...lineage, evidenceId });
}
