import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { compareDecisionPriority } from '../../../../../packages/domain/src/decision-foundry/index.mjs';
import { semanticHash, uniqueSorted } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { readJson, writeJsonAtomic } from '../../shared/json-file.mjs';
import { dataFoundryPaths } from '../data-foundry/foundry-paths.mjs';
import { decisionFoundryPaths } from './decision-foundry-paths.mjs';

export const DECISION_OBJECT_SETS = Object.freeze([
  'INCIDENTS_BLOCKED_ONLY_BY_FUTURE_LABELS', 'INCIDENTS_BLOCKED_ONLY_BY_WEATHER', 'INCIDENTS_WITH_VALID_3H_LABELS',
  'INCIDENTS_WITH_THREE_OR_MORE_VALID_PROGRESSION_STATES', 'INCIDENTS_WITH_UNSTABLE_GEOMETRY',
  'INCIDENTS_WITH_CONTRADICTORY_HYPOTHESES', 'INCIDENTS_LACKING_INDEPENDENT_PHYSICAL_CORROBORATION',
  'NEGATIVE_OPPORTUNITIES_AWAITING_CERTIFICATION', 'HARD_NEGATIVES_AWAITING_REVIEW',
  'ACQUISITIONS_RANKED_BY_DECISION_VALUE', 'DATA_PRODUCTS_WITH_BROKEN_LINEAGE', 'PRODUCTS_BLOCKED_BY_RIGHTS',
  'STALE_MATERIALIZATIONS', 'DECISIONS_AWAITING_AUTHORITY',
]);

export function summarizeProgressionForProjection(incidentId, data = {}) {
  const revisions = data.revisions ?? [], unstableGeometry = revisions.some((state) => state.classification === 'INVALID' || state.flags?.some((flag) => String(flag).match(/GEOMETRY|PLAUSIBILITY|INVALID/)));
  return { schemaVersion: 'vigia.progression-projection-summary.v1', incidentId, sourceFingerprint: data.fingerprint ?? null, acceptedStateCount: (data.acceptedStateIds ?? []).length, revisionCount: revisions.length, invalidRevisionCount: revisions.filter((state) => state.classification === 'INVALID').length, unstableGeometry };
}

const packetRows = new Set(['INCIDENTS_BLOCKED_ONLY_BY_FUTURE_LABELS', 'INCIDENTS_BLOCKED_ONLY_BY_WEATHER', 'INCIDENTS_WITH_CONTRADICTORY_HYPOTHESES', 'INCIDENTS_LACKING_INDEPENDENT_PHYSICAL_CORROBORATION', 'ACQUISITIONS_RANKED_BY_DECISION_VALUE', 'DECISIONS_AWAITING_AUTHORITY']);
const incidentRows = new Set([...packetRows, 'INCIDENTS_WITH_VALID_3H_LABELS', 'INCIDENTS_WITH_THREE_OR_MORE_VALID_PROGRESSION_STATES', 'INCIDENTS_WITH_UNSTABLE_GEOMETRY']);

export function deriveObjectSetRows(name, { packets = [], atlas = {}, progressions = [], labels = [], registry = {}, lineage = {} } = {}) {
  if (name === 'INCIDENTS_BLOCKED_ONLY_BY_FUTURE_LABELS') return packets.filter((p) => p.decisions.results.some((d) => d.state === 'BLOCKED_BY_DATA' && d.blockers.length && d.blockers.every((b) => String(b.reference).startsWith('FUTURE_LABEL_')))).map((p) => ({ incidentId: p.incident.id, knowledgeTime: p.knowledgeTime }));
  if (name === 'INCIDENTS_BLOCKED_ONLY_BY_WEATHER') return packets.filter((p) => p.decisions.results.some((d) => d.state === 'BLOCKED_BY_DATA' && d.blockers.length && d.blockers.every((b) => b.reference === 'DECODED_WEATHER'))).map((p) => ({ incidentId: p.incident.id, knowledgeTime: p.knowledgeTime }));
  if (name === 'INCIDENTS_WITH_VALID_3H_LABELS') return labels.filter((x) => (x.data.labels ?? []).some((l) => l.horizonHours === 3)).map((x) => ({ incidentId: x.incidentId }));
  if (name === 'INCIDENTS_WITH_THREE_OR_MORE_VALID_PROGRESSION_STATES') return progressions.filter((x) => (x.data.acceptedStateCount ?? (x.data.acceptedStateIds ?? []).length) >= 3).map((x) => ({ incidentId: x.incidentId, states: x.data.acceptedStateCount ?? x.data.acceptedStateIds.length }));
  if (name === 'INCIDENTS_WITH_UNSTABLE_GEOMETRY') return progressions.filter((x) => x.data.unstableGeometry === true || (x.data.revisions ?? []).some((s) => s.classification === 'INVALID' || s.flags?.some((flag) => String(flag).match(/GEOMETRY|PLAUSIBILITY|INVALID/)))).map((x) => ({ incidentId: x.incidentId }));
  if (name === 'INCIDENTS_WITH_CONTRADICTORY_HYPOTHESES') return packets.filter((p) => p.hypotheses.results.some((h) => h.state === 'CONTRADICTED')).map((p) => ({ incidentId: p.incident.id, knowledgeTime: p.knowledgeTime }));
  if (name === 'INCIDENTS_LACKING_INDEPENDENT_PHYSICAL_CORROBORATION') return packets.filter((p) => p.evidenceNeedIds.some((id) => id.includes('independent-physical-family'))).map((p) => ({ incidentId: p.incident.id, knowledgeTime: p.knowledgeTime }));
  if (name === 'NEGATIVE_OPPORTUNITIES_AWAITING_CERTIFICATION') return (atlas.entries ?? []).filter((e) => !e.certified).map((e) => ({ id: e.id, label: e.label, reasons: e.rejectionReasons }));
  if (name === 'HARD_NEGATIVES_AWAITING_REVIEW') return (atlas.entries ?? []).filter((e) => e.hardNegativeCategory && !e.certified).map((e) => ({ id: e.id, category: e.hardNegativeCategory }));
  if (name === 'ACQUISITIONS_RANKED_BY_DECISION_VALUE') return packets.flatMap((p) => p.rankedAcquisitions.filter((a) => a.priorityVector).map((a) => ({ incidentId: p.incident.id, knowledgeTime: p.knowledgeTime, candidateId: a.candidateId, priorityVector: a.priorityVector, blockers: a.blockingConditions, explanation: a.explanation }))).sort((a, b) => compareDecisionPriority(a.priorityVector, b.priorityVector));
  if (name === 'DATA_PRODUCTS_WITH_BROKEN_LINEAGE') return lineage.verification?.passed === true ? [] : (lineage.verification?.failures ?? []).map((failure) => ({ id: semanticHash('lineage-failure', failure), failure }));
  if (name === 'PRODUCTS_BLOCKED_BY_RIGHTS') return (registry.products ?? []).filter((p) => p.rights?.state === 'BLOCKED' || p.rightsState === 'BLOCKED').map((p) => ({ dataProductId: p.id }));
  if (name === 'STALE_MATERIALIZATIONS') return (registry.versions ?? []).filter((v) => v.materializationState === 'STALE').map((v) => ({ dataProductVersionId: v.id }));
  if (name === 'DECISIONS_AWAITING_AUTHORITY') return packets.flatMap((p) => p.decisions.results.filter((d) => d.state === 'BLOCKED_BY_AUTHORITY').map((d) => ({ incidentId: p.incident.id, knowledgeTime: p.knowledgeTime, decisionId: d.decisionId, authorityRequirement: d.authorityRequirement })));
  throw new Error('decision_object_set_unknown');
}

async function directoryJson(directory) {
  try { const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort(); return Promise.all(names.map(async (name) => ({ incidentId: path.basename(name, '.json'), data: await readJson(path.join(directory, name), {}) }))); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function fullContext(projectRoot) {
  const paths = decisionFoundryPaths(projectRoot), foundry = dataFoundryPaths(projectRoot);
  const [packetFiles, atlas, sourceProgressions, retainedSummaries, labels, registry, lineage] = await Promise.all([directoryJson(paths.packets), readJson(paths.atlas, { entries: [] }), directoryJson(paths.progressions), directoryJson(paths.progressionProjectionSummaries), directoryJson(paths.labels), readJson(foundry.registry, { products: [], versions: [] }), readJson(foundry.lineage, { verification: {} })]);
  const summaryByIncident = new Map(retainedSummaries.map((item) => [item.incidentId, item])), missing = sourceProgressions.filter((item) => !summaryByIncident.has(item.incidentId));
  await Promise.all(missing.map((item) => writeJsonAtomic(path.join(paths.progressionProjectionSummaries, `${item.incidentId}.json`), summarizeProgressionForProjection(item.incidentId, item.data), { space: 0 })));
  const progressions = sourceProgressions.map((item) => summaryByIncident.get(item.incidentId) ?? { incidentId: item.incidentId, data: summarizeProgressionForProjection(item.incidentId, item.data) });
  return { packets: packetFiles.map((item) => item.data), atlas, progressions, labels, registry, lineage, artifactsRead: packetFiles.length + progressions.length + labels.length + 3 };
}

async function incidentContext(projectRoot, incidentId) {
  const paths = decisionFoundryPaths(projectRoot);
  const [packet, progression, label] = await Promise.all([readJson(path.join(paths.packets, `${incidentId}.json`), null), readJson(path.join(paths.progressionProjectionSummaries, `${incidentId}.json`), null), readJson(path.join(paths.labels, `${incidentId}.json`), null)]);
  if (!progression) throw new Error(`progression_projection_summary_missing:${incidentId}`);
  return { packets: packet ? [packet] : [], progressions: progression ? [{ incidentId, data: progression }] : [], labels: label ? [{ incidentId, data: label }] : [] };
}

export async function materializeDecisionObjectSetProjection({ projectRoot = process.cwd(), affectedIncidentIds = null, reason = 'FULL_REBUILD', clock = () => new Date() } = {}) {
  const paths = decisionFoundryPaths(projectRoot), prior = await readJson(paths.objectSetProjection, null), affected = uniqueSorted(affectedIncidentIds ?? []);
  let rowsBySet = {}, artifactsRead = 0, affectedObjectCount = 0, mode = 'FULL';
  if (prior && affected.length) {
    mode = 'INCREMENTAL'; rowsBySet = { ...prior.rowsBySet };
    for (const incidentId of affected) {
      const context = await incidentContext(projectRoot, incidentId); artifactsRead += 3;
      for (const name of incidentRows) { const retained = (rowsBySet[name] ?? []).filter((row) => row.incidentId !== incidentId), replacements = deriveObjectSetRows(name, context); affectedObjectCount += replacements.length + ((rowsBySet[name] ?? []).length - retained.length); rowsBySet[name] = [...retained, ...replacements]; }
    }
  } else {
    const context = await fullContext(projectRoot); artifactsRead = context.artifactsRead;
    for (const name of DECISION_OBJECT_SETS) rowsBySet[name] = deriveObjectSetRows(name, context);
    affectedObjectCount = Object.values(rowsBySet).reduce((sum, rows) => sum + rows.length, 0);
  }
  const normalizedSets = mode === 'INCREMENTAL' ? incidentRows : DECISION_OBJECT_SETS;
  for (const name of normalizedSets) rowsBySet[name] = (rowsBySet[name] ?? []).map((row, ordinal) => { const { ordinal: _priorOrdinal, rowFingerprint: _priorFingerprint, ...semanticRow } = row; return { ...semanticRow, ordinal, rowFingerprint: semanticHash('decision-object-set-row', { name, row: semanticRow }) }; });
  const version = Number(prior?.projectionVersion ?? 0) + 1, core = { schemaVersion: 'vigia.indexed-object-set-projection.v1', projectionVersion: version, sourceEventSequence: version, generatedAt: clock().toISOString(), reason, mode, affectedIncidentIds: affected, affectedObjectCount, artifactsRead, rowsBySet };
  const consistencyToken = semanticHash('decision-object-set-consistency', core), output = { ...core, consistencyToken, replayReference: semanticHash('decision-object-set-replay', { version, consistencyToken }) };
  await writeJsonAtomic(paths.objectSetProjection, output, { space: 0 }); return output;
}

export async function readDecisionObjectSetProjection({ projectRoot = process.cwd() } = {}) {
  const paths = decisionFoundryPaths(projectRoot), value = await readJson(paths.objectSetProjection, null);
  return value ?? materializeDecisionObjectSetProjection({ projectRoot });
}
