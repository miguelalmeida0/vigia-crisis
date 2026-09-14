import { semanticHash } from '../../../../../packages/domain/src/intelligence/shared.mjs';
import { DECISION_OBJECT_SETS, readDecisionObjectSetProjection } from './object-set-projection.mjs';

export { DECISION_OBJECT_SETS } from './object-set-projection.mjs';
const CACHE = new Map();
const boundedText = (value, name, limit = 256) => { if (value === null || value === undefined) return null; const text = String(value); if (!text || text.length > limit) throw new Error(`${name}_invalid`); return text; };
function decodeCursor(value) { try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); } catch { throw new Error('decision_query_cursor_invalid'); } }

async function projection(projectRoot) {
  if (!CACHE.has(projectRoot)) CACHE.set(projectRoot, await readDecisionObjectSetProjection({ projectRoot }));
  return CACHE.get(projectRoot);
}

export function invalidateDecisionObjectSetCache(projectRoot = process.cwd()) { CACHE.delete(projectRoot); }

export async function queryDecisionObjectSet({ projectRoot = process.cwd(), name, knowledgeTime = null, incidentId = null, limit = 100, cursor = null, consistencyToken = null, rights = null } = {}) {
  if (!DECISION_OBJECT_SETS.includes(name)) throw new Error('decision_object_set_unknown');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error('decision_query_limit_invalid');
  const cutoff = knowledgeTime === null ? null : new Date(knowledgeTime).toISOString(), incident = boundedText(incidentId, 'decision_query_incident');
  const indexed = await projection(projectRoot);
  if (consistencyToken && consistencyToken !== indexed.consistencyToken) throw Object.assign(new Error('decision_query_consistency_token_mismatch'), { code: 'CONSISTENCY_TOKEN_MISMATCH', currentToken: indexed.consistencyToken });
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (decoded && decoded.token !== indexed.consistencyToken) throw new Error('decision_query_cursor_projection_mismatch');
  let results = indexed.rowsBySet[name] ?? [];
  if (incident) results = results.filter((row) => row.incidentId === incident);
  if (cutoff) results = results.filter((row) => !row.knowledgeTime || Date.parse(row.knowledgeTime) <= Date.parse(cutoff));
  if (rights?.allowedIncidentIds) { const allowed = new Set(rights.allowedIncidentIds); results = results.filter((row) => !row.incidentId || allowed.has(row.incidentId)); }
  if (decoded) results = results.filter((row) => row.ordinal > decoded.ordinal || (row.ordinal === decoded.ordinal && row.rowFingerprint > decoded.after));
  results = [...results].sort((a, b) => a.ordinal - b.ordinal || a.rowFingerprint.localeCompare(b.rowFingerprint));
  const page = results.slice(0, limit), last = page.at(-1), nextCursor = results.length > limit && last ? Buffer.from(JSON.stringify({ token: indexed.consistencyToken, ordinal: last.ordinal, after: last.rowFingerprint })).toString('base64url') : null;
  const core = { schemaVersion: 'vigia.object-set-query-result.v2', queryDefinition: name, filterDoctrine: 'Canonical typed predicate over an incremental immutable projection; knowledge-time and rights filters are fail-closed.', projectionVersion: indexed.projectionVersion, consistencyToken: indexed.consistencyToken, knowledgeTimeCutoff: cutoff, generatedAt: indexed.generatedAt, sourceState: 'INDEXED_PROJECTION', partial: false, degraded: false, rightsRestrictions: rights ? { applied: true } : { applied: false }, replayReference: indexed.replayReference, resultCount: page.length, totalMatchingCount: results.length, nextCursor, results: page };
  return { ...core, resultFingerprint: semanticHash('decision-object-set-query-result', core) };
}
